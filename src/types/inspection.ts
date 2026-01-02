// Device inspection types

export interface Defect {
  type: string;
  location: string;
  severity: "Minor" | "Moderate" | "Severe";
  description: string;
  dimensions_mm?: string;
}

export interface SectionReport {
  device_type: string;
  condition_score: number;
  overall_condition: "Excellent" | "Good" | "Fair" | "Poor" | "Damaged" | "Unknown";
  defects: Defect[];
  recommendations: string[];
  timestamp: string;
}

export interface DeviceSection {
  id: string;
  name: string;
  description: string;
  icon: string;
  captured: boolean;
  imageData?: string;
  report?: SectionReport;
}

// Single phone inspection result (for batch processing)
export interface PhoneInspection {
  inspectionId: string;
  inspectedAt: string;
  usbDeviceInfo?: USBDeviceInfo;
  sections: DeviceSection[];
}

// USB device info from libimobiledevice
export interface USBDeviceInfo {
  serialNumber?: string;
  imei?: string;
  meid?: string;
  modelNumber?: string;
  productType?: string;
  deviceName?: string;
  iosVersion?: string;
  phoneNumber?: string;
  storageTotal?: string;
  storageUsed?: string;
  batteryLevel?: number;
  activationState?: string;
  udid?: string;
}

export interface FullInspectionReport {
  inspectionId: string;
  deviceType: string;
  inspectionDate: string;
  overallScore: number;
  overallCondition: string;
  sections: {
    sectionName: string;
    score: number;
    condition: string;
    defects: Defect[];
    recommendations: string[];
  }[];
  totalDefects: number;
  summary: string;
  // USB device info
  usbDeviceInfo?: USBDeviceInfo;
}

export const PHONE_SECTIONS: Omit<DeviceSection, 'captured' | 'imageData' | 'report'>[] = [
  {
    id: "front",
    name: "Front Screen",
    description: "Position the phone screen facing the camera. Ensure good lighting to detect scratches and cracks.",
    icon: "📱",
  },
  {
    id: "back",
    name: "Back Panel",
    description: "Flip the phone to show the back panel. Include the camera module in the frame.",
    icon: "🔙",
  },
  {
    id: "left",
    name: "Left Side",
    description: "Show the left edge of the phone. Capture any buttons and the side frame.",
    icon: "◀️",
  },
  {
    id: "right",
    name: "Right Side",
    description: "Show the right edge of the phone. Include power button and any other controls.",
    icon: "▶️",
  },
  {
    id: "top",
    name: "Top Edge",
    description: "Show the top edge of the phone. Include any ports, speakers, or sensors.",
    icon: "🔼",
  },
  {
    id: "bottom",
    name: "Bottom Edge",
    description: "Show the bottom edge of the phone. Include charging port and speakers.",
    icon: "🔽",
  },
];
