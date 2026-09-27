// Software catalog (installed through winget) and the debloat list.

export const APP_CATEGORIES = [
  { id: 'browsers', name: 'Browsers', icon: 'globe' },
  { id: 'gaming', name: 'Gaming', icon: 'gamepad-2' },
  { id: 'communication', name: 'Communication', icon: 'message-circle' },
  { id: 'media', name: 'Media & Creative', icon: 'clapperboard' },
  { id: 'development', name: 'Development', icon: 'code-xml' },
  { id: 'utilities', name: 'Utilities', icon: 'wrench' },
  { id: 'runtimes', name: 'Runtimes', icon: 'layers' },
];

// `hue` tints the generated app badge.
export const APPS = [
  { id: 'Google.Chrome', name: 'Chrome', category: 'browsers', hue: 140, description: 'Fast browser from Google.' },
  { id: 'Mozilla.Firefox', name: 'Firefox', category: 'browsers', hue: 22, description: 'Independent, privacy-minded browser.' },
  { id: 'Brave.Brave', name: 'Brave', category: 'browsers', hue: 12, description: 'Chromium with a built-in ad blocker.' },
  { id: 'Opera.OperaGX', name: 'Opera GX', category: 'browsers', hue: 340, description: 'Browser built for gamers with RAM & CPU limiters.' },
  { id: 'Vivaldi.Vivaldi', name: 'Vivaldi', category: 'browsers', hue: 355, description: 'Endlessly customisable power-user browser.' },
  { id: 'LibreWolf.LibreWolf', name: 'LibreWolf', category: 'browsers', hue: 205, description: 'Hardened Firefox fork, no telemetry.' },
  { id: 'Zen-Team.Zen-Browser', name: 'Zen', category: 'browsers', hue: 30, description: 'Calm, vertical-tab Firefox-based browser.' },

  { id: 'Valve.Steam', name: 'Steam', category: 'gaming', hue: 215, description: 'The biggest PC game store and launcher.' },
  { id: 'EpicGames.EpicGamesLauncher', name: 'Epic Games', category: 'gaming', hue: 0, sat: 0, description: 'Epic store with weekly free games.' },
  { id: 'ElectronicArts.EADesktop', name: 'EA app', category: 'gaming', hue: 0, description: 'Launcher for EA games and EA Play.' },
  { id: 'Ubisoft.Connect', name: 'Ubisoft Connect', category: 'gaming', hue: 220, description: 'Launcher for Ubisoft titles.' },
  { id: 'GOG.Galaxy', name: 'GOG Galaxy', category: 'gaming', hue: 275, description: 'DRM-free games and a unified library.' },
  { id: 'Playnite.Playnite', name: 'Playnite', category: 'gaming', hue: 200, description: 'One library for every launcher.' },
  { id: 'Guru3D.Afterburner', name: 'MSI Afterburner', category: 'gaming', hue: 355, description: 'GPU overclocking and on-screen stats.' },
  { id: 'Parsec.Parsec', name: 'Parsec', category: 'gaming', hue: 240, description: 'Low-latency remote play and desktop streaming.' },

  { id: 'Discord.Discord', name: 'Discord', category: 'communication', hue: 235, description: 'Voice, video and text for communities.' },
  { id: 'Telegram.TelegramDesktop', name: 'Telegram', category: 'communication', hue: 200, description: 'Fast cloud-based messaging.' },
  { id: 'OpenWhisperSystems.Signal', name: 'Signal', category: 'communication', hue: 215, description: 'End-to-end encrypted messaging.' },
  { id: 'Zoom.Zoom', name: 'Zoom', category: 'communication', hue: 212, description: 'Video meetings and webinars.' },
  { id: 'SlackTechnologies.Slack', name: 'Slack', category: 'communication', hue: 300, description: 'Team chat and collaboration.' },

  { id: 'VideoLAN.VLC', name: 'VLC', category: 'media', hue: 28, description: 'Plays literally any video or audio file.' },
  { id: 'OBSProject.OBSStudio', name: 'OBS Studio', category: 'media', hue: 260, sat: 10, description: 'Recording and live streaming.' },
  { id: 'Spotify.Spotify', name: 'Spotify', category: 'media', hue: 141, description: 'Music and podcasts.' },
  { id: 'Audacity.Audacity', name: 'Audacity', category: 'media', hue: 25, description: 'Free multi-track audio editor.' },
  { id: 'HandBrake.HandBrake', name: 'HandBrake', category: 'media', hue: 30, description: 'Convert and compress video.' },
  { id: 'BlenderFoundation.Blender', name: 'Blender', category: 'media', hue: 28, description: '3D modelling, animation and rendering.' },
  { id: 'KDE.Krita', name: 'Krita', category: 'media', hue: 190, description: 'Professional digital painting.' },
  { id: 'Inkscape.Inkscape', name: 'Inkscape', category: 'media', hue: 0, sat: 0, description: 'Vector graphics editor.' },
  { id: 'dotPDN.PaintDotNet', name: 'Paint.NET', category: 'media', hue: 210, description: 'Simple, powerful image editor.' },

  { id: 'Microsoft.VisualStudioCode', name: 'VS Code', category: 'development', hue: 205, description: 'The code editor everyone uses.' },
  { id: 'Git.Git', name: 'Git', category: 'development', hue: 12, description: 'Distributed version control.' },
  { id: 'OpenJS.NodeJS.LTS', name: 'Node.js LTS', category: 'development', hue: 120, description: 'JavaScript runtime, long-term support.' },
  { id: 'Python.Python.3.13', name: 'Python 3.13', category: 'development', hue: 210, description: 'The Python language runtime.' },
  { id: 'Microsoft.WindowsTerminal', name: 'Windows Terminal', category: 'development', hue: 220, sat: 10, description: 'Modern tabbed terminal.' },
  { id: 'Microsoft.PowerShell', name: 'PowerShell 7', category: 'development', hue: 215, description: 'Cross-platform PowerShell.' },
  { id: 'Docker.DockerDesktop', name: 'Docker Desktop', category: 'development', hue: 205, description: 'Containers on Windows.' },
  { id: 'JetBrains.Toolbox', name: 'JetBrains Toolbox', category: 'development', hue: 290, description: 'Manage JetBrains IDEs.' },

  { id: '7zip.7zip', name: '7-Zip', category: 'utilities', hue: 0, sat: 0, description: 'Open any archive, compress anything.' },
  { id: 'voidtools.Everything', name: 'Everything', category: 'utilities', hue: 30, description: 'Find any file instantly.' },
  { id: 'Microsoft.PowerToys', name: 'PowerToys', category: 'utilities', hue: 240, description: 'FancyZones, PowerRename and more.' },
  { id: 'ShareX.ShareX', name: 'ShareX', category: 'utilities', hue: 200, description: 'Screenshots, recordings and uploads.' },
  { id: 'Notepad++.Notepad++', name: 'Notepad++', category: 'utilities', hue: 100, description: 'Lightweight text and code editor.' },
  { id: 'Bitwarden.Bitwarden', name: 'Bitwarden', category: 'utilities', hue: 215, description: 'Open-source password manager.' },
  { id: 'qBittorrent.qBittorrent', name: 'qBittorrent', category: 'utilities', hue: 210, description: 'Ad-free torrent client.' },
  { id: 'CPUID.CPU-Z', name: 'CPU-Z', category: 'utilities', hue: 260, description: 'CPU, RAM and motherboard details.' },
  { id: 'TechPowerUp.GPU-Z', name: 'GPU-Z', category: 'utilities', hue: 0, description: 'Graphics card details and sensors.' },
  { id: 'REALiX.HWiNFO', name: 'HWiNFO', category: 'utilities', hue: 200, description: 'Every sensor in your PC.' },
  { id: 'CrystalDewWorld.CrystalDiskInfo', name: 'CrystalDiskInfo', category: 'utilities', hue: 190, description: 'Drive health and S.M.A.R.T. data.' },
  { id: 'WinDirStat.WinDirStat', name: 'WinDirStat', category: 'utilities', hue: 45, description: 'See what is eating your disk.' },
  { id: 'Rufus.Rufus', name: 'Rufus', category: 'utilities', hue: 50, sat: 20, description: 'Create bootable USB drives.' },
  { id: 'Microsoft.Sysinternals.Autoruns', name: 'Autoruns', category: 'utilities', hue: 210, description: 'Everything that starts with Windows.' },
  { id: 'Malwarebytes.Malwarebytes', name: 'Malwarebytes', category: 'utilities', hue: 215, description: 'Second-opinion malware scanner.' },

  { id: 'Microsoft.VCRedist.2015+.x64', name: 'Visual C++ 2015-2022', category: 'runtimes', hue: 270, description: 'Required by most games and apps.' },
  { id: 'Microsoft.DotNet.DesktopRuntime.8', name: '.NET Desktop 8', category: 'runtimes', hue: 265, description: '.NET runtime for desktop apps.' },
  { id: 'Microsoft.DirectX', name: 'DirectX Runtime', category: 'runtimes', hue: 120, description: 'Legacy DirectX 9-11 components for older games.' },
];

export const APP_MAP = new Map(APPS.map((a) => [a.id, a]));

export const BLOAT_GROUPS = [
  { id: 'microsoft', name: 'Microsoft extras', icon: 'package' },
  { id: 'xbox', name: 'Xbox & gaming', icon: 'gamepad-2' },
  { id: 'thirdparty', name: 'Promoted third-party apps', icon: 'megaphone-off' },
];

// `id` is an Appx package name pattern (wildcards allowed).
export const BLOAT = [
  { id: 'Microsoft.BingNews', name: 'Microsoft News', group: 'microsoft', recommended: true },
  { id: 'Microsoft.BingWeather', name: 'Weather', group: 'microsoft', recommended: true },
  { id: 'Microsoft.BingSearch', name: 'Microsoft Bing', group: 'microsoft', recommended: true },
  { id: 'Microsoft.GetHelp', name: 'Get Help', group: 'microsoft', recommended: true },
  { id: 'Microsoft.Getstarted', name: 'Tips', group: 'microsoft', recommended: true },
  { id: 'Microsoft.MicrosoftOfficeHub', name: 'Microsoft 365 (Office) hub', group: 'microsoft', recommended: true },
  { id: 'Microsoft.MicrosoftSolitaireCollection', name: 'Solitaire Collection', group: 'microsoft', recommended: true },
  { id: 'Microsoft.WindowsFeedbackHub', name: 'Feedback Hub', group: 'microsoft', recommended: true },
  { id: 'Microsoft.WindowsMaps', name: 'Maps', group: 'microsoft', recommended: true },
  { id: 'Microsoft.People', name: 'People', group: 'microsoft', recommended: true },
  { id: 'Microsoft.Todos', name: 'Microsoft To Do', group: 'microsoft' },
  { id: 'Microsoft.PowerAutomateDesktop', name: 'Power Automate', group: 'microsoft', recommended: true },
  { id: 'Clipchamp.Clipchamp', name: 'Clipchamp', group: 'microsoft', recommended: true },
  { id: 'Microsoft.549981C3F5F10', name: 'Cortana', group: 'microsoft', recommended: true },
  { id: 'MicrosoftTeams', name: 'Teams (personal, classic)', group: 'microsoft', recommended: true },
  { id: 'MSTeams', name: 'Teams (personal)', group: 'microsoft' },
  { id: 'Microsoft.OutlookForWindows', name: 'Outlook (new)', group: 'microsoft' },
  { id: 'Microsoft.Windows.DevHome', name: 'Dev Home', group: 'microsoft', recommended: true },
  { id: 'Microsoft.Copilot', name: 'Copilot', group: 'microsoft' },
  { id: 'Microsoft.YourPhone', name: 'Phone Link', group: 'microsoft' },
  { id: 'Microsoft.ZuneVideo', name: 'Movies & TV', group: 'microsoft', recommended: true },
  { id: 'Microsoft.ZuneMusic', name: 'Media Player', group: 'microsoft' },
  { id: 'Microsoft.MixedReality.Portal', name: 'Mixed Reality Portal', group: 'microsoft', recommended: true },
  { id: 'Microsoft.Microsoft3DViewer', name: '3D Viewer', group: 'microsoft', recommended: true },
  { id: 'Microsoft.SkypeApp', name: 'Skype', group: 'microsoft', recommended: true },
  { id: 'Microsoft.Office.OneNote', name: 'OneNote for Windows 10', group: 'microsoft' },
  { id: 'Microsoft.WindowsAlarms', name: 'Clock & Alarms', group: 'microsoft' },
  { id: 'Microsoft.WindowsSoundRecorder', name: 'Sound Recorder', group: 'microsoft' },
  { id: 'MicrosoftCorporationII.QuickAssist', name: 'Quick Assist', group: 'microsoft' },
  { id: 'MicrosoftCorporationII.MicrosoftFamily', name: 'Family Safety', group: 'microsoft', recommended: true },

  { id: 'Microsoft.GamingApp', name: 'Xbox app', group: 'xbox' },
  { id: 'Microsoft.XboxGamingOverlay', name: 'Xbox Game Bar', group: 'xbox' },
  { id: 'Microsoft.XboxSpeechToTextOverlay', name: 'Xbox speech-to-text overlay', group: 'xbox' },
  { id: 'Microsoft.Xbox.TCUI', name: 'Xbox TCUI', group: 'xbox' },

  { id: 'king.com.*', name: 'Candy Crush & other King games', group: 'thirdparty', recommended: true },
  { id: 'SpotifyAB.SpotifyMusic', name: 'Spotify (Store preinstall)', group: 'thirdparty' },
  { id: 'Disney.37853FC22B2CE', name: 'Disney+', group: 'thirdparty', recommended: true },
  { id: 'AmazonVideo.PrimeVideo', name: 'Prime Video', group: 'thirdparty', recommended: true },
  { id: 'BytedancePte.Ltd.TikTok', name: 'TikTok', group: 'thirdparty', recommended: true },
  { id: 'Facebook.Instagram*', name: 'Instagram', group: 'thirdparty', recommended: true },
  { id: 'Facebook.Facebook', name: 'Facebook', group: 'thirdparty', recommended: true },
  { id: '7EE7776C.LinkedInforWindows', name: 'LinkedIn', group: 'thirdparty', recommended: true },
  { id: 'AdobeSystemsIncorporated.AdobePhotoshopExpress', name: 'Photoshop Express', group: 'thirdparty', recommended: true },
  { id: '*Duolingo*', name: 'Duolingo', group: 'thirdparty', recommended: true },
];

export const BLOAT_MAP = new Map(BLOAT.map((b) => [b.id, b]));
