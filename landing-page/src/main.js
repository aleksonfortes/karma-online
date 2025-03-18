// Import styles
import './style.css';

// Basic entry point for the landing page
console.log('Karma Online - Landing Page Loaded');

// Add any interactivity or analytics here
document.addEventListener('DOMContentLoaded', () => {
  const playButton = document.querySelector('a[href="https://play.karmaonline.io"]');
  if (playButton) {
    playButton.addEventListener('click', () => {
      console.log('Play button clicked');
    });
  }
}); 