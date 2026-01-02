"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWebcam } from "@/hooks/useWebcam";
import {
  GeminiLiveService,
  DefectReport,
  ConnectionStatus,
} from "@/services/geminiLiveApi";
import {
  Camera,
  CameraOff,
  SwitchCamera,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Smartphone,
  Zap,
} from "lucide-react";

interface DeviceInspectorProps {
  apiKey: string;
}

export default function DeviceInspector({ apiKey }: DeviceInspectorProps) {
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

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [isInspecting, setIsInspecting] = useState(false);
  const [currentReport, setCurrentReport] = useState<DefectReport | null>(null);
  const [inspectionHistory, setInspectionHistory] = useState<DefectReport[]>([]);
  const [rawResponse, setRawResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const serviceRef = useRef<GeminiLiveService | null>(null);
  const inspectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Gemini service
  useEffect(() => {
    if (apiKey) {
      serviceRef.current = new GeminiLiveService({ apiKey });

      // Set up handlers
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
        setCurrentReport(report);
        if (report.device_type !== "Not Detected") {
          setInspectionHistory((prev) => [report, ...prev].slice(0, 10));
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
    stopInspection();
  }, []);

  const startInspection = useCallback(() => {
    if (!isStreaming || connectionStatus !== "connected") return;

    setIsInspecting(true);
    setRawResponse("");

    // Capture and send frames every 3 seconds (to avoid rate limiting)
    inspectionIntervalRef.current = setInterval(() => {
      const frameData = captureFrame();
      if (frameData && serviceRef.current) {
        // Send image with prompt together
        serviceRef.current.sendImageWithPrompt(
          frameData,
          "Analyze this device image and provide a detailed inspection report in JSON format. Focus on identifying the device type, any visible defects, scratches, cracks, dents, or damage. Return the result as a JSON object."
        );
      }
    }, 3000);
  }, [isStreaming, connectionStatus, captureFrame]);

  const stopInspection = useCallback(() => {
    setIsInspecting(false);
    if (inspectionIntervalRef.current) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }
  }, []);

  const captureSnapshot = useCallback(() => {
    if (!isStreaming || connectionStatus !== "connected") return;

    const frameData = captureFrame();
    if (frameData && serviceRef.current) {
      setRawResponse("");
      // Send image with prompt together
      serviceRef.current.sendImageWithPrompt(
        frameData,
        "Analyze this device image and provide a detailed inspection report in JSON format. Focus on identifying the device type, any visible defects, scratches, cracks, dents, or damage. Return the result as a JSON object."
      );
    }
  }, [isStreaming, connectionStatus, captureFrame]);

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case "Excellent":
        return "text-green-500";
      case "Good":
        return "text-blue-500";
      case "Fair":
        return "text-yellow-500";
      case "Poor":
        return "text-orange-500";
      case "Damaged":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "Minor":
        return "bg-yellow-100 text-yellow-800";
      case "Moderate":
        return "bg-orange-100 text-orange-800";
      case "Severe":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Smartphone className="w-10 h-10 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">
              Device Inspector
            </h1>
          </div>
          <p className="text-slate-400">
            AI-powered device condition assessment using Gemini Live API
          </p>
        </header>

        {/* Error Display */}
        {(error || cameraError) && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{error || cameraError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Camera Feed Section */}
          <div className="lg:col-span-2 space-y-4">
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

              {/* Overlay Controls */}
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
              <div className="absolute top-4 left-4 flex gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                    isStreaming
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {isStreaming ? (
                    <Camera className="w-3 h-3" />
                  ) : (
                    <CameraOff className="w-3 h-3" />
                  )}
                  {isStreaming ? "Camera Active" : "Camera Off"}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                    connectionStatus === "connected"
                      ? "bg-green-500/20 text-green-400"
                      : connectionStatus === "connecting"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {connectionStatus === "connected" ? (
                    <Wifi className="w-3 h-3" />
                  ) : (
                    <WifiOff className="w-3 h-3" />
                  )}
                  {connectionStatus === "connected"
                    ? "API Connected"
                    : connectionStatus === "connecting"
                    ? "Connecting..."
                    : "Disconnected"}
                </span>
              </div>

              {/* Inspection Active Indicator */}
              {isInspecting && (
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Inspecting...
                  </span>
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
                  Stop Camera
                </button>
              ) : (
                <button
                  onClick={startCamera}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  Start Camera
                </button>
              )}

              <button
                onClick={switchCamera}
                disabled={!isStreaming}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SwitchCamera className="w-4 h-4" />
                {currentFacingMode === "user" ? "Rear" : "Front"}
              </button>

              {connectionStatus !== "connected" ? (
                <button
                  onClick={connectToGemini}
                  disabled={connectionStatus === "connecting"}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <Wifi className="w-4 h-4" />
                  {connectionStatus === "connecting"
                    ? "Connecting..."
                    : "Connect API"}
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
                onClick={captureSnapshot}
                disabled={!isStreaming || connectionStatus !== "connected"}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4" />
                Capture & Analyze
              </button>

              {!isInspecting ? (
                <button
                  onClick={startInspection}
                  disabled={!isStreaming || connectionStatus !== "connected"}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-4 h-4" />
                  Start Continuous
                </button>
              ) : (
                <button
                  onClick={stopInspection}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Stop Inspection
                </button>
              )}
            </div>

            {/* Raw Response */}
            {rawResponse && (
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-400 mb-2">
                  AI Response
                </h3>
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono">
                  {rawResponse}
                </pre>
              </div>
            )}
          </div>

          {/* Results Panel */}
          <div className="space-y-4">
            {/* Current Report */}
            <div className="bg-slate-800/50 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-blue-400" />
                Inspection Report
              </h2>

              {currentReport ? (
                <div className="space-y-4">
                  {/* Device Info */}
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-sm text-slate-400">Device</p>
                        <p className="text-lg font-medium text-white">
                          {currentReport.device_type}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-400">Score</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {currentReport.condition_score}/10
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">Condition:</span>
                      <span
                        className={`font-semibold ${getConditionColor(
                          currentReport.overall_condition
                        )}`}
                      >
                        {currentReport.overall_condition}
                      </span>
                    </div>
                  </div>

                  {/* Defects */}
                  {currentReport.defects.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-400 mb-2">
                        Defects Found ({currentReport.defects.length})
                      </h3>
                      <div className="space-y-2">
                        {currentReport.defects.map((defect, index) => (
                          <div
                            key={index}
                            className="bg-slate-700/50 rounded-lg p-3"
                          >
                            <div className="flex items-start justify-between mb-1">
                              <span className="font-medium text-white">
                                {defect.type}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${getSeverityColor(
                                  defect.severity
                                )}`}
                              >
                                {defect.severity}
                              </span>
                            </div>
                            <p className="text-sm text-slate-400">
                              Location: {defect.location}
                            </p>
                            <p className="text-sm text-slate-300 mt-1">
                              {defect.description}
                            </p>
                            {defect.dimensions_mm && (
                              <p className="text-xs text-slate-500 mt-1">
                                Size: {defect.dimensions_mm}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No Defects */}
                  {currentReport.defects.length === 0 &&
                    currentReport.device_type !== "Not Detected" && (
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="text-green-400">
                          No defects detected
                        </span>
                      </div>
                    )}

                  {/* Recommendations */}
                  {currentReport.recommendations.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-400 mb-2">
                        Recommendations
                      </h3>
                      <ul className="space-y-1">
                        {currentReport.recommendations.map((rec, index) => (
                          <li
                            key={index}
                            className="text-sm text-slate-300 flex items-start gap-2"
                          >
                            <span className="text-blue-400 mt-0.5">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-slate-500">
                    Last updated:{" "}
                    {new Date(currentReport.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <Smartphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No inspection data yet</p>
                  <p className="text-sm mt-1">
                    Start the camera and connect to begin
                  </p>
                </div>
              )}
            </div>

            {/* History */}
            {inspectionHistory.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">
                  Recent Inspections
                </h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {inspectionHistory.map((report, index) => (
                    <div
                      key={index}
                      className="bg-slate-700/50 rounded-lg p-3 cursor-pointer hover:bg-slate-700/70 transition-colors"
                      onClick={() => setCurrentReport(report)}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-white text-sm">
                          {report.device_type}
                        </span>
                        <span
                          className={`text-sm font-medium ${getConditionColor(
                            report.overall_condition
                          )}`}
                        >
                          {report.condition_score}/10
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {report.defects.length} defect(s) •{" "}
                        {new Date(report.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-slate-800/30 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            How to Use
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                1
              </div>
              <div>
                <p className="text-white font-medium">Start Camera</p>
                <p className="text-sm text-slate-400">
                  Allow camera access when prompted
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                2
              </div>
              <div>
                <p className="text-white font-medium">Connect API</p>
                <p className="text-sm text-slate-400">
                  Connect to Gemini Live API
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                3
              </div>
              <div>
                <p className="text-white font-medium">Position Device</p>
                <p className="text-sm text-slate-400">
                  Hold the phone in front of camera
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                4
              </div>
              <div>
                <p className="text-white font-medium">Analyze</p>
                <p className="text-sm text-slate-400">
                  Click Capture or start continuous inspection
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
