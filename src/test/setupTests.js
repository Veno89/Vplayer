import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Tauri API modules
vi.mock('@tauri-apps/api/core', () => ({
invoke: vi.fn().mockImplementation((cmd, args) => {
const defaults = {
'get_all_tracks': [],
'get_all_playlists': [],
'get_all_folders': [],
'is_playing': false,
'get_position': 0,
'get_duration': 0,
'is_finished': false,
'get_visualizer_data': {
spectrum: new Array(64).fill(0),
waveform: new Array(256).fill(0),
beat_detected: false,
peak_frequency: 0,
rms_level: 0,
},
};
return Promise.resolve(defaults[cmd] ?? null);
}),
}));

vi.mock('@tauri-apps/api/event', () => ({
listen: vi.fn().mockImplementation(() => {
return Promise.resolve(() => {});
}),
emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
open: vi.fn().mockResolvedValue(null),
ask: vi.fn().mockResolvedValue(true),
message: vi.fn().mockResolvedValue('Ok'),
save: vi.fn().mockResolvedValue(null),
}));

vi.mock('../storage/idb', () => {
return {
saveFolderHandle: async () => {},
getAllFolderHandles: async () => [],
removeFolderHandle: async () => {}
}
});

vi.mock('@tauri-apps/api/window', () => ({
  LogicalSize: class LogicalSize {
    type = 'Logical';
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
  },
  getCurrentWindow: vi.fn().mockReturnValue({
    listen: vi.fn().mockResolvedValue(() => {}),
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
    innerSize: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
    setSize: vi.fn().mockResolvedValue(),
  })
}));
