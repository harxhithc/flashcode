use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotRequest {
    pub prompt: String,
    pub prefix: String,
    pub suffix: String,
    pub language: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotResponse {
    pub completion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorTranslationRequest {
    pub error_trace: String,
    pub code_snippet: String,
    pub board: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorTranslationResponse {
    pub explanation: String,
    pub suggested_fix: String,
    pub line_number: Option<usize>,
}

pub struct AiEngine {
    #[allow(dead_code)]
    ollama_endpoint: String,
}

impl AiEngine {
    pub fn new() -> Self {
        Self {
            ollama_endpoint: "http://127.0.0.1:11434/api/generate".to_string(),
        }
    }

    /// Smart Compiler Error Translation: converts cryptic C++ traceback to human explanation
    pub async fn translate_error(
        &self,
        req: ErrorTranslationRequest,
    ) -> ErrorTranslationResponse {
        // Parse error line from traceback if possible (e.g., sketch.ino:14:5: error: ...)
        let line_number = req
            .error_trace
            .lines()
            .find_map(|line| {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() >= 3 {
                    parts[1].trim().parse::<usize>().ok()
                } else {
                    None
                }
            });

        // Offline / Rule-based smart heuristic fallback or LLM integration
        let mut explanation = "Compiler encountered an issue while processing your firmware.".to_string();
        let mut suggested_fix = "// Ensure all variables and headers are properly declared".to_string();

        if req.error_trace.contains("was not declared in this scope") {
            explanation = "A function, variable, or pin identifier was used before being declared or defined.".to_string();
            suggested_fix = "Check for typos in pin names (e.g., LED_BUILTIN, GPIO_NUM_2) or add function prototypes above setup().".to_string();
        } else if req.error_trace.contains("No such file or directory") {
            explanation = "A required C++ header file could not be found by the compiler.".to_string();
            suggested_fix = "Use the FlashCode Library Manager to install the missing library or verify your #include <...> directive.".to_string();
        } else if req.error_trace.contains("expected ';' before") {
            explanation = "Missing semicolon at the end of the previous statement.".to_string();
            suggested_fix = "Add a semicolon ';' to terminate the instruction.".to_string();
        }

        ErrorTranslationResponse {
            explanation,
            suggested_fix,
            line_number,
        }
    }

    /// Autocomplete generation for Monaco Editor ghost text
    pub async fn autocomplete(&self, req: CopilotRequest) -> CopilotResponse {
        let prefix = req.prefix.trim_end();
        let mut completion = String::new();

        // High-speed heuristics for common Arduino / ESP32 idioms
        if prefix.ends_with("Serial.") {
            completion = "println(\"FlashCode Ready\");".to_string();
        } else if prefix.ends_with("pinMode(") {
            completion = "2, OUTPUT);".to_string();
        } else if prefix.ends_with("digitalWrite(") {
            completion = "2, HIGH);".to_string();
        } else if prefix.ends_with("WiFi.") {
            completion = "begin(ssid, password);".to_string();
        }

        CopilotResponse { completion }
    }
}
