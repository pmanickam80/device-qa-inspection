"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Smartphone,
  Usb,
  RefreshCw,
  Battery,
  HardDrive,
  Fingerprint,
  Phone,
  AlertCircle,
  CheckCircle,
  Loader2,
  Link2,
  Shield,
} from "lucide-react";
// Type definition for iOS device info (matching API response)
interface IOSDeviceInfo {
  connected: boolean;
  udid?: string;
  deviceName?: string;
  deviceClass?: string;
  productType?: string;
  modelNumber?: string;
  serialNumber?: string;
  imei?: string;
  meid?: string;
  phoneNumber?: string;
  iccid?: string;
  iosVersion?: string;
  buildVersion?: string;
  batteryLevel?: number;
  batteryHealth?: string;
  storageTotal?: string;
  storageUsed?: string;
  activationState?: string;
  pairingStatus?: string;
  error?: string;
}

interface DeviceInfoPanelProps {
  onDeviceInfoChange?: (info: IOSDeviceInfo | null) => void;
}

export default function DeviceInfoPanel({ onDeviceInfoChange }: DeviceInfoPanelProps) {
  const [deviceInfo, setDeviceInfo] = useState<IOSDeviceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPairing, setIsPairing] = useState(false);

  const fetchDeviceInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/device-info");
      const data: IOSDeviceInfo = await response.json();

      setDeviceInfo(data);
      onDeviceInfoChange?.(data);

      if (data.error && !data.connected) {
        setError(data.error);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch device info";
      setError(errorMsg);
      setDeviceInfo(null);
      onDeviceInfoChange?.(null);
    } finally {
      setIsLoading(false);
    }
  }, [onDeviceInfoChange]);

  const handlePair = async () => {
    if (!deviceInfo?.udid) return;

    setIsPairing(true);
    try {
      const response = await fetch("/api/device-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pair", udid: deviceInfo.udid }),
      });
      const data = await response.json();

      if (data.success) {
        // Wait a moment for user to accept on device, then refresh
        setTimeout(fetchDeviceInfo, 3000);
      } else {
        setError(data.error || "Pairing failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pairing request failed");
    } finally {
      setIsPairing(false);
    }
  };

  // Auto-fetch on mount and poll every 5 seconds
  useEffect(() => {
    fetchDeviceInfo();

    const interval = setInterval(fetchDeviceInfo, 5000);
    return () => clearInterval(interval);
  }, [fetchDeviceInfo]);

  const getDeviceIcon = (deviceClass?: string) => {
    switch (deviceClass?.toLowerCase()) {
      case "iphone":
        return <Smartphone className="w-6 h-6" />;
      case "ipad":
        return <Smartphone className="w-6 h-6" />;
      default:
        return <Smartphone className="w-6 h-6" />;
    }
  };

  const getBatteryColor = (level?: number) => {
    if (!level) return "text-gray-400";
    if (level >= 50) return "text-green-400";
    if (level >= 20) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Usb className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold text-white">USB Device Info</h3>
        </div>
        <button
          onClick={fetchDeviceInfo}
          disabled={isLoading}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-slate-400 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Loading State */}
      {isLoading && !deviceInfo && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="ml-2 text-slate-400">Detecting device...</span>
        </div>
      )}

      {/* No Device Connected */}
      {!isLoading && !deviceInfo?.connected && (
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-3">
            <Usb className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-slate-400 mb-2">No iOS device connected</p>
          <p className="text-sm text-slate-500">Connect an iPhone or iPad via USB cable</p>
        </div>
      )}

      {/* Pairing Required */}
      {deviceInfo?.connected && deviceInfo.pairingStatus === "Not Paired" && (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
              <div>
                <p className="text-amber-200 font-medium">Device Not Paired</p>
                <p className="text-sm text-amber-200/70 mt-1">
                  Unlock your iPhone and tap &quot;Trust&quot; when prompted
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handlePair}
            disabled={isPairing}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isPairing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Initiating Pairing...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                Pair Device
              </>
            )}
          </button>

          {deviceInfo.udid && (
            <div className="text-xs text-slate-500 text-center">
              UDID: {deviceInfo.udid.substring(0, 8)}...
            </div>
          )}
        </div>
      )}

      {/* Device Info Display */}
      {deviceInfo?.connected && deviceInfo.pairingStatus === "Paired" && (
        <div className="space-y-4">
          {/* Device Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-700">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
              {getDeviceIcon(deviceInfo.deviceClass)}
            </div>
            <div>
              <h4 className="text-white font-medium">{deviceInfo.deviceName || "iOS Device"}</h4>
              <p className="text-sm text-slate-400">
                {deviceInfo.productType} • iOS {deviceInfo.iosVersion}
              </p>
            </div>
            <CheckCircle className="w-5 h-5 text-green-400 ml-auto" />
          </div>

          {/* Key Info Grid */}
          <div className="grid grid-cols-1 gap-3">
            {/* Serial Number */}
            {deviceInfo.serialNumber && (
              <div className="flex items-center justify-between py-2 px-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Serial</span>
                </div>
                <span className="text-sm text-white font-mono">{deviceInfo.serialNumber}</span>
              </div>
            )}

            {/* IMEI */}
            {deviceInfo.imei && (
              <div className="flex items-center justify-between py-2 px-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">IMEI</span>
                </div>
                <span className="text-sm text-white font-mono">{deviceInfo.imei}</span>
              </div>
            )}

            {/* Model */}
            {deviceInfo.modelNumber && (
              <div className="flex items-center justify-between py-2 px-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Model</span>
                </div>
                <span className="text-sm text-white font-mono">{deviceInfo.modelNumber}</span>
              </div>
            )}

            {/* Phone Number */}
            {deviceInfo.phoneNumber && (
              <div className="flex items-center justify-between py-2 px-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Phone</span>
                </div>
                <span className="text-sm text-white">{deviceInfo.phoneNumber}</span>
              </div>
            )}

            {/* Battery */}
            {deviceInfo.batteryLevel !== undefined && (
              <div className="flex items-center justify-between py-2 px-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Battery className={`w-4 h-4 ${getBatteryColor(deviceInfo.batteryLevel)}`} />
                  <span className="text-sm text-slate-400">Battery</span>
                </div>
                <span className={`text-sm font-medium ${getBatteryColor(deviceInfo.batteryLevel)}`}>
                  {deviceInfo.batteryLevel}%
                </span>
              </div>
            )}

            {/* Storage */}
            {deviceInfo.storageTotal && (
              <div className="flex items-center justify-between py-2 px-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Storage</span>
                </div>
                <span className="text-sm text-white">
                  {deviceInfo.storageUsed} / {deviceInfo.storageTotal}
                </span>
              </div>
            )}

            {/* Activation State */}
            {deviceInfo.activationState && (
              <div className="flex items-center justify-between py-2 px-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400">Activation</span>
                </div>
                <span className={`text-sm font-medium ${
                  deviceInfo.activationState === "Activated"
                    ? "text-green-400"
                    : "text-amber-400"
                }`}>
                  {deviceInfo.activationState}
                </span>
              </div>
            )}
          </div>

          {/* UDID (collapsed) */}
          <details className="group">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
              Show UDID
            </summary>
            <p className="mt-1 text-xs text-slate-400 font-mono break-all bg-slate-700/30 p-2 rounded">
              {deviceInfo.udid}
            </p>
          </details>
        </div>
      )}

      {/* Error Display */}
      {error && deviceInfo?.connected && deviceInfo.pairingStatus !== "Not Paired" && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
