export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ConfigurationError extends AppError {
  constructor() {
    super(
      "CONFIGURATION_ERROR",
      "The service is not configured correctly.",
      503,
    );
    this.name = "ConfigurationError";
  }
}

export class SessionExpiredError extends AppError {
  constructor(
    message = "Your UCSD login was rejected. Sign in at tss.ucsd.edu/fiori, then paste a fresh SAP_SESSIONID_S4P_500 value.",
  ) {
    super("SESSION_EXPIRED", message, 401);
    this.name = "SessionExpiredError";
  }
}

export class UpstreamError extends AppError {
  constructor() {
    super(
      "UPSTREAM_ERROR",
      "The UCSD service is temporarily unavailable.",
      502,
    );
    this.name = "UpstreamError";
  }
}

export function isSessionExpiredError(
  error: unknown,
): error is SessionExpiredError {
  return error instanceof AppError && error.code === "SESSION_EXPIRED";
}
