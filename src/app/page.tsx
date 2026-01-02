"use client";

import { useState, useEffect } from "react";
import MultiSectionInspector from "@/components/MultiSectionInspector";
import { Key, ExternalLink, AlertTriangle } from "lucide-react";

export default function Home() {
  const [apiKey, setApiKey] = useState<string>("");
  const [inputKey, setInputKey] = useState<string>("");
  const [isKeySet, setIsKeySet] = useState(false);

  // Check for stored API key on mount
  useEffect(() => {
    const storedKey = localStorage.getItem("gemini_api_key");
    if (storedKey) {
      setApiKey(storedKey);
      setIsKeySet(true);
    }
  }, []);

  const handleSetApiKey = () => {
    if (inputKey.trim()) {
      localStorage.setItem("gemini_api_key", inputKey.trim());
      setApiKey(inputKey.trim());
      setIsKeySet(true);
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem("gemini_api_key");
    setApiKey("");
    setInputKey("");
    setIsKeySet(false);
  };

  if (!isKeySet) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-8 shadow-xl border border-slate-700/50">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Device Inspector
              </h1>
              <p className="text-slate-400">
                AI-powered device condition assessment
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="apiKey"
                  className="block text-sm font-medium text-slate-300 mb-2"
                >
                  Google Gemini API Key
                </label>
                <input
                  type="password"
                  id="apiKey"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={(e) => e.key === "Enter" && handleSetApiKey()}
                />
              </div>

              <button
                onClick={handleSetApiKey}
                disabled={!inputKey.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                Start Inspection
              </button>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mt-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-200 font-medium">
                      Security Note
                    </p>
                    <p className="text-xs text-amber-200/70 mt-1">
                      For production use, API keys should be handled server-side
                      using ephemeral tokens. This demo stores the key locally
                      for simplicity.
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-center pt-4 border-t border-slate-700">
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Get your API key from Google AI Studio
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          <p className="text-center text-slate-500 text-xs mt-6">
            Powered by Google Gemini Live API
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* API Key Management */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={handleClearApiKey}
          className="px-3 py-1.5 bg-slate-700/80 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors flex items-center gap-2"
        >
          <Key className="w-4 h-4" />
          Change API Key
        </button>
      </div>

      <MultiSectionInspector apiKey={apiKey} />
    </div>
  );
}
