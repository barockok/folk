import posthog from 'posthog-js'

export interface RendererTelemetryOptions {
  distinctId: string
  enabled: boolean
  key: string
  host: string
}

let initialised = false
let enabled = false

export function initRendererTelemetry(opts: RendererTelemetryOptions): void {
  if (initialised) return
  if (!opts.key) return
  posthog.init(opts.key, {
    api_host: opts.host,
    person_profiles: 'never',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    persistence: 'memory',
    bootstrap: { distinctID: opts.distinctId },
  })
  enabled = opts.enabled
  if (!enabled) posthog.opt_out_capturing()
  initialised = true
}

export function captureRenderer(event: string, props: Record<string, unknown> = {}): void {
  if (!initialised || !enabled) return
  posthog.capture(event, props)
}

export function setRendererEnabled(next: boolean): void {
  enabled = next
  if (!initialised) return
  if (next) posthog.opt_in_capturing()
  else posthog.opt_out_capturing()
}

// Test-only — reset module-level state between tests.
export function __resetForTest(): void {
  initialised = false
  enabled = false
}
