# JoyCore-X

A modern configuration dashboard for JoyCore-FW controllers, built with Tauri, React, and Rust.

## 🚧 Work in Progress

This project is currently being migrated from the [original Qt6/C++ implementation](https://github.com/gingerskull/JoyCore-X) to a modern Tauri-based application. Core functionality is implemented but hardware testing is pending.

## Overview

JoyCore-X provides a desktop application for configuring RP2040-based HOTAS controllers via USB serial communication. Configure axes, buttons, and profiles through an intuitive interface.
## Tech Stack

- **Backend**: Rust + Tauri 2.0 for native integration and serial communication
- **Frontend**: React 19 + TypeScript + shadcn/ui components
- **Styling**: Tailwind CSS v4
- **Device Communication**: USB Serial (CDC) @ 115200 baud
- **Target Hardware**: RP2040-based controllers (VID: 0x2E8A, PID: 0xA02F)

## Current Status

- ✅ Tauri backend with serial communication
- ✅ React frontend with modern UI components
- ✅ Device discovery and connection management
- ✅ Configuration interfaces (axes, buttons, profiles)
- 🔄 Hardware testing pending
- ⏳ Advanced features in development

## Unified Serial Architecture (Overview)

The legacy dual-path serial code has been fully removed in favor of a single unified asynchronous command + event pipeline:

- A background reader task parses every inbound line once.
- Lines are classified as either command response buffer lines or real-time event/monitor lines (GPIO/MATRIX/SHIFT/etc.).
- High‑level operations build a `CommandSpec` (name, matcher, timeout, optional min-duration) and dispatch it through a `UnifiedSerialHandle`.
- A `ResponseMatcher` (Contains / UntilPrefix / FixedLines / Custom) determines completion. Metrics (latency, success/failure counts) are collected per command name.
- Real‑time hardware state updates are broadcast on an event channel for UI consumers to snapshot without blocking command flow.

Benefits:
1. Single source of truth for serial parsing (no duplicated readers)
2. Deterministic matching + timeout handling
3. Built‑in latency instrumentation for future tuning
4. Clean separation between request/response flows and streaming hardware telemetry

Key Types (Rust backend):
- `UnifiedSerialBuilder` – constructs the background task + handle
- `UnifiedSerialHandle` – API surface (send_command, get snapshots, metrics)
- `CommandSpec` / `ResponseMatcher` – declarative response completion

All prior feature flags (e.g. `unified-serial`) were removed; the unified path is always active.

## Event-Driven Device Management (New)

Previously the UI performed interval polling plus an explicit cleanup pass that could race with transient enumeration glitches and cause flicker or false disconnects. This has been replaced with a push/event model:

- The backend assigns stable logical IDs to devices (key = `port_name:serial_number`) and emits:
	- `device_list_updated` with the full authoritative list whenever discovery or a state mutation occurs.
	- `device_connection_changed` with `{ id, state }` on connection lifecycle transitions.
- Frontend `useDevice` hook subscribes to these events and no longer polls; interval refresh logic was removed.
- Manual user “Refresh” now calls a lightweight `force_discover_devices` command (alias to discovery) which itself triggers the same events; no special cleanup path exists.
- Legacy `cleanup_disconnected_devices` function and command were removed entirely to avoid aggressive misclassification; disappearance is resolved naturally by the next discovery emission.

Benefits:
1. Eliminates race conditions between overlapping poll cycles.
2. Prevents UUID churn (stable IDs) eliminating UI re‑mount flicker.
3. Reduces serial contention (fewer IDENTIFY/status bursts) improving connect reliability.
4. Simplifies mental model: UI treats backend as single source of truth fed via events.

Minimal Compatibility Layer:
- Deprecated `refreshDevices` / `refreshDevicesSilently` methods remain as no‑ops temporarily for components pending cleanup; they can be safely removed once no references exist.

See `src/hooks/useDevice.ts` for the event subscription logic and `src-tauri/src/device/manager.rs` for emission points.

## Development Setup

```bash
# Install dependencies
npm install

# Run development server
npm run tauri dev

# Build for production
npm run tauri build
```

## Requirements

- Node.js 18+
- Rust 1.70+
- Tauri CLI
- Compatible JoyCore hardware for testing


See [MIGRATION_PROGRESS.md](./MIGRATION_PROGRESS.md) for detailed development status and roadmap.
