'use strict';
// Final public class assembled from the focused VRClub method layers.
class VRClub extends VRClubAudioCrowd {}

Object.assign(VRClub.prototype, window.LEDPatterns, window.VenueDressing, window.Mezzanine, window.CityDistrict, window.VJDesk, window.CharacterStyles, window.PersonalAppearance, window.GuestExperience, window.SessionExperience);
window.VRClub = VRClub;

// Instantiated by js/ui-init.js only after the splash-screen user gesture.
