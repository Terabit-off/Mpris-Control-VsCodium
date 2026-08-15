# Changelog

All notable changes to the **MPRIS Music Control** extension will be documented in this file.

## 1.2.0

### Added

- **Adaptive Background Color**
- **Advanced Customization Settings:** Integrated direct settings bindings into the standard VSCodium preferences menu (`Ctrl + ,`):
  - `mprisMusicControl.backgroundMode`: Toggle between automatic _adaptive_ color or a _custom_ static color.
  - `mprisMusicControl.customBackgroundColor`: Input any manual HEX-color code for the custom background.
  - `mprisMusicControl.artRadius`: Modify image corner radius (set to `50` for a fully circular vinyl disk look).
  - `mprisMusicControl.artSpin`: Enable a continuous vinyl-like spinning rotation effect on album art during active playback.
  - `mprisMusicControl.fallbackArtPath`: Define an absolute system path to a custom image file to use as an idle fallback placeholder.
  - `mprisMusicControl.backgroundOpacity`: Opacity level for the card background.
