import * as XLSX from "xlsx";
import { DeviceSection, FullInspectionReport, Defect, USBDeviceInfo } from "@/types/inspection";

export function generateInspectionReport(
  sections: DeviceSection[],
  inspectionId?: string,
  usbDeviceInfo?: USBDeviceInfo
): FullInspectionReport {
  const completedSections = sections.filter((s) => s.report);

  // Determine device type from most common detection
  const deviceTypes = completedSections
    .map((s) => s.report?.device_type)
    .filter((t) => t && t !== "Not Detected" && t !== "Unknown");
  const deviceType = deviceTypes[0] || "Unknown Device";

  // Calculate overall score
  const scores = completedSections
    .map((s) => s.report?.condition_score || 0)
    .filter((s) => s > 0);
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  // Determine overall condition
  const getCondition = (score: number): string => {
    if (score >= 9) return "Excellent";
    if (score >= 7) return "Good";
    if (score >= 5) return "Fair";
    if (score >= 3) return "Poor";
    return "Damaged";
  };

  // Collect all defects
  const allDefects = completedSections.flatMap((s) => s.report?.defects || []);

  // Generate summary
  const summary = allDefects.length === 0
    ? "Device is in excellent condition with no visible defects."
    : `Device has ${allDefects.length} defect(s) identified across ${completedSections.length} sections inspected.`;

  return {
    inspectionId: inspectionId || `INS-${Date.now()}`,
    deviceType: usbDeviceInfo?.productType || deviceType,
    inspectionDate: new Date().toISOString(),
    overallScore,
    overallCondition: getCondition(overallScore),
    sections: completedSections.map((s) => ({
      sectionName: s.name,
      score: s.report?.condition_score || 0,
      condition: s.report?.overall_condition || "Unknown",
      defects: s.report?.defects || [],
      recommendations: s.report?.recommendations || [],
    })),
    totalDefects: allDefects.length,
    summary,
    usbDeviceInfo,
  };
}

export function exportToExcel(
  report: FullInspectionReport,
  filename?: string
): void {
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Summary (with USB device info)
  const summaryData: (string | number)[][] = [
    ["Device Inspection Report"],
    [],
    ["Inspection ID", report.inspectionId],
    ["Device Type", report.deviceType],
    ["Inspection Date", new Date(report.inspectionDate).toLocaleString()],
    ["Overall Score", `${report.overallScore}/10`],
    ["Overall Condition", report.overallCondition],
    ["Total Defects Found", report.totalDefects],
    [],
  ];

  // Add USB device info if available
  if (report.usbDeviceInfo) {
    summaryData.push(["USB Device Information"]);
    summaryData.push([]);
    if (report.usbDeviceInfo.serialNumber) {
      summaryData.push(["Serial Number", report.usbDeviceInfo.serialNumber]);
    }
    if (report.usbDeviceInfo.imei) {
      summaryData.push(["IMEI", report.usbDeviceInfo.imei]);
    }
    if (report.usbDeviceInfo.meid) {
      summaryData.push(["MEID", report.usbDeviceInfo.meid]);
    }
    if (report.usbDeviceInfo.modelNumber) {
      summaryData.push(["Model Number", report.usbDeviceInfo.modelNumber]);
    }
    if (report.usbDeviceInfo.productType) {
      summaryData.push(["Product Type", report.usbDeviceInfo.productType]);
    }
    if (report.usbDeviceInfo.deviceName) {
      summaryData.push(["Device Name", report.usbDeviceInfo.deviceName]);
    }
    if (report.usbDeviceInfo.iosVersion) {
      summaryData.push(["iOS Version", report.usbDeviceInfo.iosVersion]);
    }
    if (report.usbDeviceInfo.phoneNumber) {
      summaryData.push(["Phone Number", report.usbDeviceInfo.phoneNumber]);
    }
    if (report.usbDeviceInfo.storageTotal) {
      summaryData.push(["Storage", `${report.usbDeviceInfo.storageUsed} / ${report.usbDeviceInfo.storageTotal}`]);
    }
    if (report.usbDeviceInfo.batteryLevel !== undefined) {
      summaryData.push(["Battery Level", `${report.usbDeviceInfo.batteryLevel}%`]);
    }
    if (report.usbDeviceInfo.activationState) {
      summaryData.push(["Activation State", report.usbDeviceInfo.activationState]);
    }
    if (report.usbDeviceInfo.udid) {
      summaryData.push(["UDID", report.usbDeviceInfo.udid]);
    }
    summaryData.push([]);
  }

  summaryData.push(["Summary"]);
  summaryData.push([report.summary]);
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);

  // Set column widths
  summarySheet["!cols"] = [{ wch: 20 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  // Sheet 2: Section Details
  const sectionHeaders = [
    "Section",
    "Score",
    "Condition",
    "Defect Count",
    "Recommendations",
  ];
  const sectionRows = report.sections.map((s) => [
    s.sectionName,
    `${s.score}/10`,
    s.condition,
    s.defects.length,
    s.recommendations.join("; "),
  ]);
  const sectionData = [sectionHeaders, ...sectionRows];
  const sectionSheet = XLSX.utils.aoa_to_sheet(sectionData);
  sectionSheet["!cols"] = [
    { wch: 15 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(workbook, sectionSheet, "Sections");

  // Sheet 3: All Defects
  const defectHeaders = [
    "Section",
    "Defect Type",
    "Location",
    "Severity",
    "Description",
    "Dimensions",
  ];
  const defectRows: (string | number)[][] = [];
  report.sections.forEach((section) => {
    section.defects.forEach((defect) => {
      defectRows.push([
        section.sectionName,
        defect.type,
        defect.location,
        defect.severity,
        defect.description,
        defect.dimensions_mm || "N/A",
      ]);
    });
  });

  if (defectRows.length === 0) {
    defectRows.push(["No defects found", "", "", "", "", ""]);
  }

  const defectData = [defectHeaders, ...defectRows];
  const defectSheet = XLSX.utils.aoa_to_sheet(defectData);
  defectSheet["!cols"] = [
    { wch: 15 },
    { wch: 15 },
    { wch: 20 },
    { wch: 10 },
    { wch: 50 },
    { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(workbook, defectSheet, "Defects");

  // Sheet 4: Raw Data (for analysis)
  const rawHeaders = [
    "Section",
    "Device Type",
    "Score",
    "Condition",
    "Timestamp",
    "Defect Type",
    "Defect Location",
    "Defect Severity",
    "Defect Description",
    "Defect Dimensions",
  ];
  const rawRows: (string | number)[][] = [];
  report.sections.forEach((section) => {
    if (section.defects.length === 0) {
      rawRows.push([
        section.sectionName,
        report.deviceType,
        section.score,
        section.condition,
        report.inspectionDate,
        "None",
        "",
        "",
        "",
        "",
      ]);
    } else {
      section.defects.forEach((defect) => {
        rawRows.push([
          section.sectionName,
          report.deviceType,
          section.score,
          section.condition,
          report.inspectionDate,
          defect.type,
          defect.location,
          defect.severity,
          defect.description,
          defect.dimensions_mm || "",
        ]);
      });
    }
  });
  const rawData = [rawHeaders, ...rawRows];
  const rawSheet = XLSX.utils.aoa_to_sheet(rawData);
  rawSheet["!cols"] = [
    { wch: 15 },
    { wch: 20 },
    { wch: 8 },
    { wch: 12 },
    { wch: 20 },
    { wch: 15 },
    { wch: 20 },
    { wch: 10 },
    { wch: 40 },
    { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(workbook, rawSheet, "Raw Data");

  // Generate filename
  const exportFilename = filename ||
    `Device_Inspection_${report.inspectionId}_${new Date().toISOString().split("T")[0]}.xlsx`;

  // Download the file
  XLSX.writeFile(workbook, exportFilename);
}

export function exportMultipleInspections(
  inspections: FullInspectionReport[],
  filename?: string
): void {
  const workbook = XLSX.utils.book_new();

  // All inspections summary with USB device info
  const summaryHeaders = [
    "Inspection ID",
    "Serial Number",
    "IMEI",
    "Model",
    "Device Type",
    "iOS Version",
    "Date",
    "Overall Score",
    "Condition",
    "Total Defects",
    "Sections Inspected",
    "Activation Status",
  ];
  const summaryRows = inspections.map((i) => [
    i.inspectionId,
    i.usbDeviceInfo?.serialNumber || "N/A",
    i.usbDeviceInfo?.imei || "N/A",
    i.usbDeviceInfo?.modelNumber || "N/A",
    i.usbDeviceInfo?.productType || i.deviceType,
    i.usbDeviceInfo?.iosVersion || "N/A",
    new Date(i.inspectionDate).toLocaleDateString(),
    `${i.overallScore}/10`,
    i.overallCondition,
    i.totalDefects,
    i.sections.length,
    i.usbDeviceInfo?.activationState || "N/A",
  ]);
  const summaryData = [summaryHeaders, ...summaryRows];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "All Inspections");

  // All defects across all inspections
  const allDefectHeaders = [
    "Inspection ID",
    "Device Type",
    "Date",
    "Section",
    "Defect Type",
    "Location",
    "Severity",
    "Description",
  ];
  const allDefectRows: (string | number)[][] = [];
  inspections.forEach((inspection) => {
    inspection.sections.forEach((section) => {
      section.defects.forEach((defect) => {
        allDefectRows.push([
          inspection.inspectionId,
          inspection.deviceType,
          new Date(inspection.inspectionDate).toLocaleDateString(),
          section.sectionName,
          defect.type,
          defect.location,
          defect.severity,
          defect.description,
        ]);
      });
    });
  });

  if (allDefectRows.length === 0) {
    allDefectRows.push(["No defects found across all inspections", "", "", "", "", "", "", ""]);
  }

  const allDefectData = [allDefectHeaders, ...allDefectRows];
  const allDefectSheet = XLSX.utils.aoa_to_sheet(allDefectData);
  XLSX.utils.book_append_sheet(workbook, allDefectSheet, "All Defects");

  const exportFilename = filename ||
    `Device_Inspections_Batch_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(workbook, exportFilename);
}
