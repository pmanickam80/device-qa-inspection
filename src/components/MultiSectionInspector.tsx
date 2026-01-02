"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebcam } from "@/hooks/useWebcam";
import {
  GeminiLiveService,
  ConnectionStatus,
} from "@/services/geminiLiveApi";
import {
  DeviceSection,
  SectionReport,
  PHONE_SECTIONS,
  USBDeviceInfo,
  FullInspectionReport,
} from "@/types/inspection";
import {
  generateInspectionReport,
  exportToExcel,
  exportMultipleInspections,
} from "@/utils/excelExport";
import DeviceInfoPanel from "./DeviceInfoPanel";

// Type for iOS device info from API
interface IOSDeviceInfo {
  connected: boolean;
  udid?: string;
  deviceName?: string;
  productType?: string;
  modelNumber?: string;
  serialNumber?: string;
  imei?: string;
  meid?: string;
  phoneNumber?: string;
  iosVersion?: string;
  storageTotal?: string;
  storageUsed?: string;
  batteryLevel?: number;
  activationState?: string;
  pairingStatus?: string;
}
import {
  Camera,
  CameraOff,
  SwitchCamera,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle,
  XCircle,
  Download,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Smartphone,
  Loader2,
} from "lucide-react";

interface MultiSectionInspectorProps {
  apiKey: string;
}

export default function MultiSectionInspector({ apiKey }: MultiSectionInspectorProps) {
  const {
    videoRef,
    canvasRef,
    isStreaming,
    error: cameraError,
    startCamera,
    stopCamera,
    captureFrame,
    switchCamera,
    currentFacingMode,
  } = useWebcam({ width: 1280, height: 720, facingMode: "environment" });

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [sections, setSections] = useState<DeviceSection[]>(
    PHONE_SECTIONS.map((s) => ({ ...s, captured: false }))
  );
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectionComplete, setInspectionComplete] = useState(false);
  const [rawResponse, setRawResponse] = useState<string>("");
  const [usbDeviceInfo, setUsbDeviceInfo] = useState<USBDeviceInfo | null>(null);
  const [batchInspections, setBatchInspections] = useState<FullInspectionReport[]>([]);

  const serviceRef = useRef<GeminiLiveService | null>(null);
  const pendingReportRef = useRef<{ sectionIndex: number; resolve: (report: SectionReport) => void } | null>(null);

  // Initialize Gemini service
  useEffect(() => {
    if (apiKey) {
      serviceRef.current = new GeminiLiveService({ apiKey });

      const unsubMessage = serviceRef.current.onMessage((message) => {
        setRawResponse((prev) => prev + message);
      });

      const unsubStatus = serviceRef.current.onStatusChange((status) => {
        setConnectionStatus(status);
        if (status === "error") {
          setError("Connection to Gemini API failed");
        }
      });

      const unsubDefect = serviceRef.current.onDefectReport((report) => {
        if (pendingReportRef.current) {
          pendingReportRef.current.resolve(report);
          pendingReportRef.current = null;
        }
        setRawResponse("");
      });

      return () => {
        unsubMessage();
        unsubStatus();
        unsubDefect();
        serviceRef.current?.disconnect();
      };
    }
  }, [apiKey]);

  const connectToGemini = useCallback(async () => {
    if (!serviceRef.current) return;

    try {
      setError(null);
      await serviceRef.current.connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, []);

  const disconnectFromGemini = useCallback(() => {
    serviceRef.current?.disconnect();
  }, []);

  const currentSection = sections[currentSectionIndex];

  const captureAndAnalyzeSection = useCallback(async () => {
    if (!isStreaming || connectionStatus !== "connected" || !serviceRef.current) {
      return;
    }

    setIsAnalyzing(true);
    setRawResponse("");
    setError(null);

    const frameData = captureFrame();
    if (!frameData) {
      setError("Failed to capture frame");
      setIsAnalyzing(false);
      return;
    }

    // Store the captured image
    setSections((prev) =>
      prev.map((s, i) =>
        i === currentSectionIndex ? { ...s, imageData: frameData } : s
      )
    );

    // Create a promise to wait for the report
    const reportPromise = new Promise<SectionReport>((resolve) => {
      pendingReportRef.current = { sectionIndex: currentSectionIndex, resolve };

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingReportRef.current) {
          pendingReportRef.current = null;
          resolve({
            device_type: "Unknown",
            condition_score: 0,
            overall_condition: "Unknown",
            defects: [],
            recommendations: ["Analysis timed out. Please try again."],
            timestamp: new Date().toISOString(),
          });
        }
      }, 30000);
    });

    // Send image for analysis
    serviceRef.current.sendImageWithPrompt(
      frameData,
      `Analyze this ${currentSection.name} of a mobile phone and provide a detailed inspection report in JSON format.
       Focus on identifying:
       - Any scratches, cracks, chips, or physical damage
       - Dents, dings, or deformations
       - Discoloration or wear marks
       - Condition of any ports, buttons, or components visible

       Return the result as a JSON object with: device_type, condition_score (1-10), overall_condition, defects array, recommendations array, and timestamp.`
    );

    try {
      const report = await reportPromise;

      // Update section with report
      setSections((prev) =>
        prev.map((s, i) =>
          i === currentSectionIndex
            ? { ...s, captured: true, report }
            : s
        )
      );

      // Auto-advance to next section if not the last one
      if (currentSectionIndex < sections.length - 1) {
        setCurrentSectionIndex((prev) => prev + 1);
      } else {
        // All sections complete
        setInspectionComplete(true);
      }
    } catch {
      setError("Failed to analyze section");
    } finally {
      setIsAnalyzing(false);
    }
  }, [isStreaming, connectionStatus, captureFrame, currentSectionIndex, currentSection, sections.length]);

  const goToSection = (index: number) => {
    if (index >= 0 && index < sections.length) {
      setCurrentSectionIndex(index);
    }
  };

  const resetInspection = () => {
    setSections(PHONE_SECTIONS.map((s) => ({ ...s, captured: false })));
    setCurrentSectionIndex(0);
    setInspectionComplete(false);
    setRawResponse("");
    setError(null);
  };

  const handleDeviceInfoChange = useCallback((info: IOSDeviceInfo | null) => {
    if (info?.connected && info.pairingStatus === "Paired") {
      setUsbDeviceInfo({
        serialNumber: info.serialNumber,
        imei: info.imei,
        meid: info.meid,
        modelNumber: info.modelNumber,
        productType: info.productType,
        deviceName: info.deviceName,
        iosVersion: info.iosVersion,
        phoneNumber: info.phoneNumber,
        storageTotal: info.storageTotal,
        storageUsed: info.storageUsed,
        batteryLevel: info.batteryLevel,
        activationState: info.activationState,
        udid: info.udid,
      });
    } else {
      setUsbDeviceInfo(null);
    }
  }, []);

  const handleExportExcel = () => {
    const report = generateInspectionReport(sections, undefined, usbDeviceInfo || undefined);
    exportToExcel(report);
  };

  const handleSaveToBatch = () => {
    const report = generateInspectionReport(sections, undefined, usbDeviceInfo || undefined);
    setBatchInspections((prev) => [...prev, report]);
    // Reset for next phone
    resetInspection();
  };

  const handleExportBatch = () => {
    if (batchInspections.length === 0) return;
    exportMultipleInspections(batchInspections);
  };

  const handleClearBatch = () => {
    setBatchInspections([]);
  };

  const completedCount = sections.filter((s) => s.captured).length;
  const progress = (completedCount / sections.length) * 100;

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case "Excellent": return "text-green-500 bg-green-500/10";
      case "Good": return "text-blue-500 bg-blue-500/10";
      case "Fair": return "text-yellow-500 bg-yellow-500/10";
      case "Poor": return "text-orange-500 bg-orange-500/10";
      case "Damaged": return "text-red-500 bg-red-500/10";
      default: return "text-gray-500 bg-gray-500/10";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <header className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Smartphone className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">
              6-Section Device Inspection
            </h1>
          </div>
          <p className="text-slate-400">
            Capture all 6 sections of the device for a complete inspection report
          </p>
        </header>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <span>Progress: {completedCount}/{sections.length} sections</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Error Display */}
        {(error || cameraError) && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error || cameraError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Section Navigation Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* USB Device Info Panel */}
            <DeviceInfoPanel onDeviceInfoChange={handleDeviceInfoChange} />

            <h3 className="text-sm font-medium text-slate-400 mb-3">Sections</h3>
            {sections.map((section, index) => (
              <button
                key={section.id}
                onClick={() => goToSection(index)}
                className={`w-full p-3 rounded-lg text-left transition-all flex items-center gap-3 ${
                  index === currentSectionIndex
                    ? "bg-blue-600 text-white"
                    : section.captured
                    ? "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                    : "bg-slate-700/50 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <span className="text-xl">{section.icon}</span>
                <div className="flex-1">
                  <div className="font-medium">{section.name}</div>
                  {section.captured && section.report && (
                    <div className="text-xs opacity-75">
                      Score: {section.report.condition_score}/10
                    </div>
                  )}
                </div>
                {section.captured ? (
                  <CheckCircle className="w-5 h-5" />
                ) : index === currentSectionIndex ? (
                  <ChevronRight className="w-5 h-5" />
                ) : null}
              </button>
            ))}

            {/* Export Single Phone */}
            {completedCount > 0 && (
              <button
                onClick={handleExportExcel}
                className="w-full mt-4 p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-5 h-5" />
                Export This Phone
              </button>
            )}

            {/* Save to Batch & Next Phone */}
            {completedCount > 0 && (
              <button
                onClick={handleSaveToBatch}
                className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <Smartphone className="w-5 h-5" />
                Save & Next Phone
              </button>
            )}

            {/* Batch Status & Export */}
            {batchInspections.length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="text-sm text-blue-400 mb-2">
                  Batch: {batchInspections.length} phone(s) saved
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportBatch}
                    className="flex-1 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-1 text-sm transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export All
                  </button>
                  <button
                    onClick={handleClearBatch}
                    className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Reset Button */}
            {completedCount > 0 && (
              <button
                onClick={resetInspection}
                className="w-full p-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
                Reset Current
              </button>
            )}
          </div>

          {/* Main Camera Area */}
          <div className="lg:col-span-2 space-y-4">
            {/* Current Section Info */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{currentSection.icon}</span>
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {currentSection.name}
                  </h2>
                  <p className="text-sm text-slate-400">
                    Section {currentSectionIndex + 1} of {sections.length}
                  </p>
                </div>
              </div>
              <p className="text-slate-300">{currentSection.description}</p>
            </div>

            {/* Camera View */}
            <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    Start Camera
                  </button>
                </div>
              )}

              {/* Status Indicators */}
              <div className="absolute top-3 left-3 flex gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                  isStreaming ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {isStreaming ? <Camera className="w-3 h-3" /> : <CameraOff className="w-3 h-3" />}
                  {isStreaming ? "Live" : "Off"}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                  connectionStatus === "connected"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}>
                  {connectionStatus === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {connectionStatus === "connected" ? "API" : "Disconnected"}
                </span>
              </div>

              {/* Analyzing Overlay */}
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-3" />
                    <p className="text-white font-medium">Analyzing {currentSection.name}...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Control Buttons */}
            <div className="flex flex-wrap gap-3">
              {isStreaming ? (
                <button
                  onClick={stopCamera}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  <CameraOff className="w-4 h-4" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={startCamera}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  Start
                </button>
              )}

              <button
                onClick={switchCamera}
                disabled={!isStreaming}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <SwitchCamera className="w-4 h-4" />
                Flip
              </button>

              {connectionStatus !== "connected" ? (
                <button
                  onClick={connectToGemini}
                  disabled={connectionStatus === "connecting"}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <Wifi className="w-4 h-4" />
                  {connectionStatus === "connecting" ? "Connecting..." : "Connect API"}
                </button>
              ) : (
                <button
                  onClick={disconnectFromGemini}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  <WifiOff className="w-4 h-4" />
                  Disconnect
                </button>
              )}

              <button
                onClick={captureAndAnalyzeSection}
                disabled={!isStreaming || connectionStatus !== "connected" || isAnalyzing}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    Capture {currentSection.name}
                  </>
                )}
              </button>
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between">
              <button
                onClick={() => goToSection(currentSectionIndex - 1)}
                disabled={currentSectionIndex === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <button
                onClick={() => goToSection(currentSectionIndex + 1)}
                disabled={currentSectionIndex === sections.length - 1}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Raw Response */}
            {rawResponse && (
              <div className="bg-slate-800/50 rounded-lg p-4 max-h-32 overflow-auto">
                <h3 className="text-sm font-medium text-slate-400 mb-2">AI Response</h3>
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">
                  {rawResponse}
                </pre>
              </div>
            )}
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Current Section Report */}
            {currentSection.captured && currentSection.report && (
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  {currentSection.name} Results
                </h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Score</span>
                    <span className="text-2xl font-bold text-blue-400">
                      {currentSection.report.condition_score}/10
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Condition</span>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${getConditionColor(currentSection.report.overall_condition)}`}>
                      {currentSection.report.overall_condition}
                    </span>
                  </div>

                  {currentSection.report.defects.length > 0 && (
                    <div>
                      <h4 className="text-sm text-slate-400 mb-2">
                        Defects ({currentSection.report.defects.length})
                      </h4>
                      <div className="space-y-2">
                        {currentSection.report.defects.map((defect, i) => (
                          <div key={i} className="bg-slate-700/50 rounded p-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-white font-medium">{defect.type}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                defect.severity === "Severe" ? "bg-red-500/20 text-red-400" :
                                defect.severity === "Moderate" ? "bg-orange-500/20 text-orange-400" :
                                "bg-yellow-500/20 text-yellow-400"
                              }`}>
                                {defect.severity}
                              </span>
                            </div>
                            <p className="text-slate-400 text-xs mt-1">{defect.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentSection.report.defects.length === 0 && (
                    <div className="bg-green-500/10 rounded p-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 text-sm">No defects detected</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Overall Summary */}
            {completedCount > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Inspection Summary
                </h3>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sections Completed</span>
                    <span className="text-white">{completedCount}/{sections.length}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Defects</span>
                    <span className="text-white">
                      {sections.reduce((sum, s) => sum + (s.report?.defects.length || 0), 0)}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Avg Score</span>
                    <span className="text-white">
                      {completedCount > 0
                        ? (
                            sections
                              .filter((s) => s.report)
                              .reduce((sum, s) => sum + (s.report?.condition_score || 0), 0) /
                            completedCount
                          ).toFixed(1)
                        : 0}
                      /10
                    </span>
                  </div>
                </div>

                {inspectionComplete && (
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Inspection Complete!</span>
                    </div>
                    <p className="text-sm text-green-400/70 mt-1">
                      Click &quot;Export to Excel&quot; to download the report.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            {completedCount === 0 && (
              <div className="bg-slate-800/50 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3">
                  How to Inspect
                </h3>
                <ol className="space-y-2 text-sm text-slate-300">
                  <li className="flex gap-2">
                    <span className="text-blue-400">1.</span>
                    Start the camera and connect API
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-400">2.</span>
                    Position the {currentSection.name}
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-400">3.</span>
                    Click capture to analyze
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-400">4.</span>
                    Repeat for all 6 sections
                  </li>
                  <li className="flex gap-2">
                    <span className="text-blue-400">5.</span>
                    Export results to Excel
                  </li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
