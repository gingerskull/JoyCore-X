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
