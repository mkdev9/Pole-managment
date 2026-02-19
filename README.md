# Utility Pole Management System

A distributed IoT system for real-time monitoring and fault detection in electric utility poles. The system uses a hierarchy of autonomous protection nodes (Arduino) coordinated through a cloud backend (Node.js/Firebase) and visualized via a modern React dashboard.

## 🚀 Overview

- **Distributed Fault Detection**: Each pole acts as an autonomous node, monitoring voltage and current.
- **Cascading Power Loss Modeling**: Intelligent differentiation between localized faults and cascading grid shutdowns.
- **Real-time Visualization**: Interactive topology view and real-time sensor data charts.
- **Fail-safe Logic**: Automatic relay control to isolate faults and protect grid infrastructure.

## 🛠 Project Structure

- `arduino/`:  Arduino Nano + ENC28J60 Ethernet module. 
- `backend/`: Node.js server with Firebase integration for state coordination and fault engine logic.
- `frontend/`: React + Vite + TailwindCSS dashboard for system monitoring.

## 🏁 Getting Started

### Prerequisites

- Node.js (v18+)
- Arduino IDE (for firmware)
- Firebase Project (Realtime Database)


### Backend Setup

1. Navigate to `backend/`.
2. Install dependencies: `npm install`.
3. Create a `.env` file based on `.env.example`.
4. Add your Firebase Service Account JSON to `backend/config/`.
5. Start the server: `npm start`.

### Frontend Setup

1. Navigate to `frontend/`.
2. Install dependencies: `npm install`.
3. Start the dev server: `npm run dev`.

### Arduino Setup

1. Open `arduino/utility_pole_monitor/utility_pole_monitor.ino` in Arduino IDE.
2. Update `POLE_NUMBER` and `serverAddress` in the configuration section.
3. Upload to your Arduino Nano or your Desired arduino board.

## 📜 Architecture

The system follows a linear topology:
`Grid → Pole 1 → Pole 2 → Pole 3 → Pole 4 (Terminal Node)`

All nodes publish status to the cloud, forming a "digital twin" that the fault engine uses to identify the exact location of faults even without direct wired communication between poles.

## ⚖ License

This project is licensed under the MIT License - see the LICENSE file for details.
