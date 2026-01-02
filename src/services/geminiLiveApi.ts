"use client";

// Gemini Live API WebSocket Service for real-time device inspection
// Using the Multimodal Live API for streaming video analysis

export interface GeminiLiveConfig {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
}

export interface DefectReport {
  device_type: string;
  condition_score: number; // 1-10 scale
  overall_condition: "Excellent" | "Good" | "Fair" | "Poor" | "Damaged";
  defects: Defect[];
  recommendations: string[];
  timestamp: string;
}

export interface Defect {
  type: string;
  location: string;
  severity: "Minor" | "Moderate" | "Severe";
  description: string;
  dimensions_mm?: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type MessageHandler = (message: string) => void;
export type StatusHandler = (status: ConnectionStatus) => void;
export type DefectHandler = (report: DefectReport) => void;

const DEVICE_INSPECTION_PROMPT = `You are an expert device quality inspector specializing in mobile phone condition assessment.
Analyze the device shown in the video frame and provide a detailed inspection report.

For each frame, evaluate:

1. **Screen Condition**
   - Cracks, chips, or fractures
   - Scratches (light, deep, or gouges)
   - Dead pixels or display anomalies
   - Screen burn-in or discoloration

2. **Body/Housing Condition**
   - Dents, dings, or deformations
   - Scratches on back panel and frame
   - Paint/coating wear or peeling
   - Corner and edge damage

3. **Functional Components**
   - Camera lens condition (scratches, cracks, debris)
   - Button condition and alignment
   - Port condition (charging port, headphone jack)
   - Speaker/microphone grille condition

4. **Overall Assessment**
   - Device model identification (if visible)
   - Estimated condition grade (1-10 scale)
   - Category: Excellent (9-10), Good (7-8), Fair (5-6), Poor (3-4), Damaged (1-2)

Return your findings as a JSON object with this structure:
{
  "device_type": "string - identified device model or 'Unknown'",
  "condition_score": number (1-10),
  "overall_condition": "Excellent|Good|Fair|Poor|Damaged",
  "defects": [
    {
      "type": "Screen Crack|Scratch|Dent|etc.",
      "location": "where on device",
      "severity": "Minor|Moderate|Severe",
      "description": "detailed description",
      "dimensions_mm": "estimated size if applicable"
    }
  ],
  "recommendations": ["array of repair/action recommendations"],
  "timestamp": "ISO timestamp"
}

If no device is clearly visible, respond with:
{
  "device_type": "Not Detected",
  "condition_score": 0,
  "overall_condition": "Unknown",
  "defects": [],
  "recommendations": ["Please position the device clearly in front of the camera"],
  "timestamp": "ISO timestamp"
}

Be thorough but concise. Focus on actual visible defects, not speculative issues.`;

export class GeminiLiveService {
  private ws: WebSocket | null = null;
  private config: GeminiLiveConfig;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private defectHandlers: DefectHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private currentStatus: ConnectionStatus = "disconnected";
  private accumulatedResponse: string = ""; // Accumulate streaming response

  constructor(config: GeminiLiveConfig) {
    this.config = {
      model: "gemini-2.0-flash-exp",
      systemInstruction: DEVICE_INSPECTION_PROMPT,
      ...config,
    };
  }

  private setStatus(status: ConnectionStatus) {
    this.currentStatus = status;
    this.statusHandlers.forEach((handler) => handler(status));
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter((h) => h !== handler);
    };
  }

  onDefectReport(handler: DefectHandler) {
    this.defectHandlers.push(handler);
    return () => {
      this.defectHandlers = this.defectHandlers.filter((h) => h !== handler);
    };
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setStatus("connecting");

    return new Promise((resolve, reject) => {
      try {
        // Gemini Live API WebSocket endpoint
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.config.apiKey}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log("WebSocket connected to Gemini Live API");
          this.reconnectAttempts = 0;

          // Send setup message
          this.sendSetupMessage();
          this.setStatus("connected");
          resolve();
        };

        this.ws.onmessage = async (event) => {
          // Handle both Blob and string data
          let data: string;
          if (event.data instanceof Blob) {
            data = await event.data.text();
          } else {
            data = event.data;
          }
          this.handleMessage(data);
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.setStatus("error");
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log("WebSocket closed:", event.code, event.reason);
          this.setStatus("disconnected");

          // Attempt reconnection
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
          }
        };
      } catch (error) {
        this.setStatus("error");
        reject(error);
      }
    });
  }

  private sendSetupMessage() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const setupMessage = {
      setup: {
        model: `models/${this.config.model}`,
        generationConfig: {
          responseModalities: ["TEXT"],
          temperature: 0.4,
          topP: 0.95,
          topK: 40,
        },
        systemInstruction: {
          parts: [{ text: this.config.systemInstruction }],
        },
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
    console.log("Setup message sent");
  }

  sendVideoFrame(base64ImageData: string, mimeType: string = "image/jpeg") {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not connected");
      return;
    }

    // For Live API, send image via realtimeInput with proper structure
    const realtimeInputMessage = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: mimeType,
            data: base64ImageData,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(realtimeInputMessage));
    console.log("Sent video frame via realtimeInput");
  }

  // Send image with text prompt together via clientContent
  sendImageWithPrompt(base64ImageData: string, prompt: string, mimeType: string = "image/jpeg") {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not connected");
      return;
    }

    // Clear any previous accumulated response
    this.accumulatedResponse = "";

    // Send image and text together in a single turn
    const clientContentMessage = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64ImageData,
                },
              },
              { text: prompt },
            ],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(clientContentMessage));
    console.log("Sent image with prompt via clientContent");
  }

  sendTextPrompt(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket not connected");
      return;
    }

    const clientContentMessage = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(clientContentMessage));
    console.log("Sent text prompt");
  }

  private handleMessage(data: string) {
    try {
      const message = JSON.parse(data);
      console.log("Received message:", JSON.stringify(message).substring(0, 500));

      // Handle setup complete
      if (message.setupComplete) {
        console.log("Gemini Live API setup complete");
        return;
      }

      // Handle server content (model responses)
      if (message.serverContent) {
        const { modelTurn, turnComplete } = message.serverContent;

        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            if (part.text) {
              console.log("Received text chunk:", part.text.substring(0, 100));
              // Accumulate the response
              this.accumulatedResponse += part.text;
              this.messageHandlers.forEach((handler) => handler(part.text));
            }
          }
        }

        if (turnComplete) {
          console.log("Model turn complete, parsing accumulated response");
          // Parse the complete accumulated response
          this.parseDefectReport(this.accumulatedResponse);
          // Reset for next response
          this.accumulatedResponse = "";
        }
      }

      // Handle tool calls if needed
      if (message.toolCall) {
        console.log("Tool call received:", message.toolCall);
      }

      // Handle errors
      if (message.error) {
        console.error("API Error:", message.error);
        this.messageHandlers.forEach((handler) =>
          handler(`Error: ${message.error.message || JSON.stringify(message.error)}`)
        );
      }
    } catch (error) {
      console.error("Error parsing message:", error, "Raw data:", data.substring(0, 200));
    }
  }

  private parseDefectReport(text: string) {
    try {
      console.log("Parsing complete response:", text.substring(0, 300));

      // Remove markdown code block wrapper if present
      let cleanText = text;

      // Handle ```json ... ``` wrapper
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleanText = codeBlockMatch[1].trim();
      }

      // Try to extract JSON object from the text
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const report = JSON.parse(jsonMatch[0]) as DefectReport;

        // Add timestamp if not present
        if (!report.timestamp) {
          report.timestamp = new Date().toISOString();
        }

        console.log("Successfully parsed report:", report.device_type, "Score:", report.condition_score);
        this.defectHandlers.forEach((handler) => handler(report));
      } else {
        console.log("No JSON object found in response");
      }
    } catch (error) {
      // Not a valid JSON response
      console.error("Failed to parse JSON:", error, "Text:", text.substring(0, 200));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  getStatus(): ConnectionStatus {
    return this.currentStatus;
  }
}

// Singleton instance management
let serviceInstance: GeminiLiveService | null = null;

export function getGeminiLiveService(config: GeminiLiveConfig): GeminiLiveService {
  if (!serviceInstance) {
    serviceInstance = new GeminiLiveService(config);
  }
  return serviceInstance;
}

export function resetGeminiLiveService() {
  if (serviceInstance) {
    serviceInstance.disconnect();
    serviceInstance = null;
  }
}
