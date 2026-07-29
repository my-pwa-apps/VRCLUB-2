// Final public class assembled from the focused VRClub method layers.
class VRClub extends VRClubAudioCrowd {}

Object.assign(VRClub.prototype, window.LEDPatterns);
window.VRClub = VRClub;

// Instantiated by js/ui-init.js only after the splash-screen user gesture.
