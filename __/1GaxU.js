
(function () {
  
  if (localStorage.getItem('EducationAlerts') === 'true') {
    return;
  }

  
  const userChoice = confirm('If you want more unb*cked links join the discord, press OK to join or Cancel to cancel, this will only show once.');

  
  localStorage.setItem('EducationAlerts', 'true');

  
  if (userChoice) {
    window.location.href = 'https://discord.gg/zaka';
  }
  // If user clicked Cancel, do nothing
})();
