function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? error.cause : undefined;
    return `${error.name}: ${error.message}${cause ? ` ${errorText(cause)}` : ""}`;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }
  return String(error || "Unknown error");
}

/** Converts provider and transport failures into safe, actionable UI messages. */
export function friendlyAiError(error: unknown): string {
  const message = errorText(error);

  if (/aborted|aborterror|cancelled/i.test(message)) return "Generation was stopped.";
  if (/high demand|service unavailable|\b503\b|overloaded/i.test(message))
    return "The AI service is temporarily busy. Automatic fallback was attempted; please retry in a moment.";
  if (/rate.?limit|\b429\b/i.test(message))
    return "The AI request limit was reached. Please wait briefly and try again.";
  if (/quota|billing|insufficient_quota|credit/i.test(message))
    return "The AI account has no available quota. Check API billing and usage limits, then retry.";
  if (/invalid.*api.?key|incorrect.*api.?key|authentication|\b401\b|\b403\b/i.test(message))
    return "An AI credential was rejected. Check the server API keys and restart the development server.";
  if (/model.*not found|unknown model|does not exist|unsupported model/i.test(message))
    return "The configured AI model is unavailable for this account. Check model access and configuration.";
  if (/fetch|network|timed?\s*out|connection/i.test(message))
    return "The AI service could not be reached. Check the connection and try again.";
  if (/unauthorized|session.*expired|invalid token/i.test(message))
    return "Your session needs to be refreshed. Sign in again, then retry.";
  if (/max_tokens|max_completion_tokens/i.test(message))
    return "The AI request format is incompatible with the selected model. Restart the server to load the corrected configuration.";

  return "Generation could not be completed. Your work is still saved; please retry.";
}
