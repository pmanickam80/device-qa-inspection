import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface IOSDeviceInfo {
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

async function runCommand(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(command, { timeout: 10000 });
    return stdout.trim();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw error;
  }
}

async function getConnectedDevices(): Promise<string[]> {
  try {
    const output = await runCommand("idevice_id -l");
    if (!output) return [];
    return output.split("\n").filter((id) => id.trim());
  } catch {
    return [];
  }
}

async function getDeviceInfo(udid?: string): Promise<Record<string, string>> {
  try {
    const udidArg = udid ? `-u ${udid}` : "";
    const output = await runCommand(`ideviceinfo ${udidArg}`);

    const info: Record<string, string> = {};
    const lines = output.split("\n");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        info[key] = value;
      }
    }

    return info;
  } catch (error) {
    throw error;
  }
}

async function getBatteryInfo(udid?: string): Promise<Record<string, string>> {
  try {
    const udidArg = udid ? `-u ${udid}` : "";
    const output = await runCommand(
      `ideviceinfo ${udidArg} -q com.apple.mobile.battery`
    );

    const info: Record<string, string> = {};
    const lines = output.split("\n");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        info[key] = value;
      }
    }

    return info;
  } catch {
    return {};
  }
}

async function getDiskUsage(udid?: string): Promise<Record<string, string>> {
  try {
    const udidArg = udid ? `-u ${udid}` : "";
    const output = await runCommand(
      `ideviceinfo ${udidArg} -q com.apple.disk_usage`
    );

    const info: Record<string, string> = {};
    const lines = output.split("\n");

    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        info[key] = value;
      }
    }

    return info;
  } catch {
    return {};
  }
}

async function checkPairingStatus(udid?: string): Promise<string> {
  try {
    const udidArg = udid ? `-u ${udid}` : "";
    await runCommand(`idevicepair ${udidArg} validate`);
    return "Paired";
  } catch (error) {
    if (error instanceof Error && error.message.includes("not paired")) {
      return "Not Paired";
    }
    return "Unknown";
  }
}

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export async function GET() {
  try {
    // Check for connected devices
    const devices = await getConnectedDevices();

    if (devices.length === 0) {
      return NextResponse.json({
        connected: false,
        error: "No iOS device connected. Please connect a device via USB cable.",
      });
    }

    const udid = devices[0];

    // Get device info
    let deviceInfo: Record<string, string>;
    try {
      deviceInfo = await getDeviceInfo(udid);
    } catch (error) {
      // Device might not be paired
      const pairingStatus = await checkPairingStatus(udid);

      if (pairingStatus === "Not Paired") {
        return NextResponse.json({
          connected: true,
          udid,
          pairingStatus: "Not Paired",
          error: "Device is not paired. Please unlock your iPhone and tap 'Trust' when prompted.",
        });
      }

      return NextResponse.json({
        connected: true,
        udid,
        error: error instanceof Error ? error.message : "Failed to read device info",
      });
    }

    // Get additional info
    const [batteryInfo, diskUsage, pairingStatus] = await Promise.all([
      getBatteryInfo(udid),
      getDiskUsage(udid),
      checkPairingStatus(udid),
    ]);

    // Calculate storage
    let storageTotal = "";
    let storageUsed = "";
    if (diskUsage.TotalDataCapacity && diskUsage.TotalDataAvailable) {
      const total = parseInt(diskUsage.TotalDataCapacity);
      const available = parseInt(diskUsage.TotalDataAvailable);
      const used = total - available;
      storageTotal = formatBytes(total);
      storageUsed = formatBytes(used);
    }

    const response: IOSDeviceInfo = {
      connected: true,
      udid,
      deviceName: deviceInfo.DeviceName,
      deviceClass: deviceInfo.DeviceClass,
      productType: deviceInfo.ProductType,
      modelNumber: deviceInfo.ModelNumber,
      serialNumber: deviceInfo.SerialNumber,
      imei: deviceInfo.InternationalMobileEquipmentIdentity,
      meid: deviceInfo.MobileEquipmentIdentifier,
      phoneNumber: deviceInfo.PhoneNumber,
      iccid: deviceInfo.IntegratedCircuitCardIdentity,
      iosVersion: deviceInfo.ProductVersion,
      buildVersion: deviceInfo.BuildVersion,
      batteryLevel: batteryInfo.BatteryCurrentCapacity
        ? parseInt(batteryInfo.BatteryCurrentCapacity)
        : undefined,
      batteryHealth: batteryInfo.BatteryHealth,
      storageTotal,
      storageUsed,
      activationState: deviceInfo.ActivationState,
      pairingStatus,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Device info error:", error);
    return NextResponse.json({
      connected: false,
      error: error instanceof Error ? error.message : "Failed to get device info",
    });
  }
}

// POST endpoint to trigger pairing
export async function POST(request: Request) {
  try {
    const { action, udid } = await request.json();

    if (action === "pair") {
      const udidArg = udid ? `-u ${udid}` : "";
      try {
        await runCommand(`idevicepair ${udidArg} pair`);
        return NextResponse.json({ success: true, message: "Pairing initiated. Please check your device." });
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : "Pairing failed"
        });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Request failed"
    }, { status: 500 });
  }
}
