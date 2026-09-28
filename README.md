# NEXUS 3D — Multi-Printer Monitoring & Telemetry Hub

A real-time 3D printer monitoring and telemetry application built for Klipper/Moonraker and OctoPrint printers, optimized for **Pantheon WebOps Hosting** and direct LAN/tunnel communication.

---

## 🖨️ Configured Printers

| Printer Name | Local IP Address | Port | Firmware / API | Initial Status |
| :--- | :--- | :--- | :--- | :--- |
| **Printer 01 (QIDI X-Series)** | `192.168.1.124` | `7125` / `80` | Klipper / Moonraker v1.4 | **Online & Printing** (`qidi-box-ams-snap-base`) |
| **Printer 02 (CoreXY Pro)** | `192.168.1.36` | `7125` | Klipper / Moonraker | **Standby / Offline** (Pingable / Configurable) |

---

## 🚀 Deploying to Pantheon WebOps Hosting

This repository includes `pantheon.yml` and `index.php` preconfigured for Pantheon's Git-based deployment workflow.

### 1. Initialize Git in this directory (if not already done)
```bash
git init
git add .
git commit -m "Deploy NEXUS 3D Monitoring System to Pantheon"
```

### 2. Connect to your Pantheon Site Repository
In your Pantheon Dashboard, navigate to your site's **Dev** tab and copy your Git connection string:
```bash
git remote add pantheon ssh://codeserver.dev.{site-uuid}@codeserver.dev.{site-uuid}.drush.in:2222/~/repository.git
```

### 3. Push to Pantheon
```bash
git push pantheon master
```

Once pushed, your app is immediately live on your Pantheon URL:
`https://dev-{site-name}.pantheonsite.io`

---

## 🌐 Network Architecture & Connecting to Local Printers

Because Pantheon is hosted in the cloud while your 3D printers (`192.168.1.124` and `192.168.1.36`) reside on your local private network, the application uses **client-side direct browser communication**:

1. **Direct LAN Link**: When you open the website on your computer/laptop, your browser is on the same local network as your printers. The browser communicates directly with `http://192.168.1.124:7125` and `http://192.168.1.36:7125`.
2. **Moonraker CORS Configuration**: To allow the Pantheon domain to query Moonraker, add your Pantheon URL or a wildcard to `moonraker.conf` on your printer:
   ```ini
   [authorization]
   cors_domains:
       *://*.pantheonsite.io
       https://*.pantheonsite.io
       http://localhost:*
       http://127.0.0.1:*
   ```
   Then restart Moonraker (`sudo systemctl restart moonraker`).
3. **Remote Access Outside Home (Optional)**: If you want to check your prints from your phone when away from home, you can configure a free **Cloudflare Tunnel**, **Tailscale Funnel**, or **Ngrok** endpoint in the in-app **Settings** modal.

---

## 🛠️ Key Features
- **Real-Time Telemetry**: Extruder (actual vs target), Heated Bed (actual vs target), Chamber temperature, power percentages.
- **Dynamic Temperature Graph**: HTML5 Canvas graphing live thermal history with target thresholds.
- **2D Bed & Toolhead Visualizer**: Real-time rendering of nozzle position across the 275×295mm build volume.
- **Full Kinematics & Axis Jogging**: Diamond X/Y controls, Z vertical control, step sizes (0.1, 1, 10, 50, 100mm), Home All (`G28`).
- **Live G-Code Terminal**: Direct command dispatch (`M105`, `M114`, `M84`, custom macros) with live color-coded logging.
- **Dual Fleet Overview**: Split view to monitor both printers simultaneously.
- **Emergency Stop (M112)**: Instant safety trigger to cut all heaters and freeze stepper motors.
- **Simulation Mode**: Built-in test simulation for offline environments and testing.
