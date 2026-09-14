// Care subscriptions and AI accounting use the private family service.
// Upstream CBoard telemetry and payment integrations are not part of that flow.
export const legacyServicesEnabled =
  process.env.REACT_APP_CARE_COLLABORATION !== 'true';
