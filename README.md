# SideTabs - Vertical Tab Manager for VS Code

SideTabs is a Visual Studio Code extension that displays your editor tabs vertically in a dedicated sidebar panel, providing an alternative way to navigate and manage your open files.

## Features

- **Vertical Tab Layout**: View all your open tabs in a clean, vertical list
- **Smart Tab Management**:
  - Focus tabs with a single click
  - Close tabs using the X button
  - Reorder tabs with drag and drop
- **Rich Visual Indicators**:
  - File-specific icons that match your VS Code icon theme
  - Orange indicators for unsaved files
  - Error and warning counters for each file
- **Context Menu Actions**:
  - Close a tab
  - Close other tabs
  - Close all tabs
  - Split editor
  - Copy file path
- **Visual Customization**:
  - Configurable tab height
  - Adjustable font size
  - Optional directory path display
- **Theme Integration**: Automatically adopts your VS Code color theme
- **Multilingual Support**: Available in English and Spanish

## Installation

1. Install the extension from the VS Code Marketplace
2. The SideTabs icon will appear in your Activity Bar
3. Click the icon to open the vertical tabs panel

## Usage

- **View Management**:
  - Click on any tab to switch to that file
  - Drag and drop tabs to reorder them
  - Use the context menu (right-click) for additional options

- **Configuration**:
  - Adjust settings through VS Code's settings panel:
    - `sidetabs.fontSize`: Set the font size for tab labels (10-24px)
    - `sidetabs.tabHeight`: Set the height of tabs (30-60px)
    - `sidetabs.showDirectoryPath`: Show or hide the directory path beside filenames

## Development

### Build Instructions

1. Clone the repository
2. Install dependencies:
   ```cmd
   npm install
   ```
3. Compile the extension:
   ```cmd
   npm run compile
   ```
4. Press F5 in VS Code to launch the extension in a development host

### Project Structure

- `src/extension.ts`: Main extension code
- `media/icon.svg`: Activity bar icon
- `media/close.svg`: Tab close button icon
- `media/save.svg`: Unsaved file indicator icon

## Technical Implementation

- Built on VS Code's Webview API for seamless UI integration
- Uses the official Tab Groups API to track and manage editor tabs
- Implements custom icon handling with theme integration
- Maintains an independent tab order separate from VS Code's native ordering
- Integrates with VS Code's diagnostics system for error/warning display

## Planned Improvements

- Persist custom tab order between sessions
- GitHub Copilot integration
- Tab filtering and search
- Translation into additional languages
- Improved initial load speed
- Improved context menu
- Add different views depending on whether it's in the right or left sidebar

## License

This extension is licensed under the GNU General Public License v3.0 (GPL-3.0).
