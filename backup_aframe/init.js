// Initialize the club environment when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('VR Club initializing...');
  
  // Attach club-environment component to scene
  const scene = document.querySelector('a-scene');
  if (scene) {
    scene.setAttribute('club-environment', '');
    console.log('Club environment component attached');
  } else {
    console.error('A-Frame scene not found');
  }
});

// Add event listeners for VR mode
window.addEventListener('load', function() {
  const scene = document.querySelector('a-scene');
  
  if (scene) {
    scene.addEventListener('enter-vr', function() {
      console.log('Entered VR mode');
    });
    
    scene.addEventListener('exit-vr', function() {
      console.log('Exited VR mode');
    });
  }
});
