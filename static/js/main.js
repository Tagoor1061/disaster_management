// Mobile Menu Toggle & Navigation Drawer Controller
document.addEventListener('DOMContentLoaded', function() {
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  const mobileBackdrop = document.getElementById('mobile-nav-backdrop');
  const drawerCloseBtn = document.getElementById('mobile-drawer-close');

  function openMobileNav() {
    if (mobileDrawer && mobileBackdrop) {
      mobileDrawer.classList.add('open');
      mobileBackdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeMobileNav() {
    if (mobileDrawer && mobileBackdrop) {
      mobileDrawer.classList.remove('open');
      mobileBackdrop.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // Delegated click listener for any mobile menu toggle button on the page
  document.addEventListener('click', function(e) {
    const toggleBtn = e.target.closest('#mobile-nav-toggle, .mobile-nav-toggle-btn, [data-action="open-mobile-nav"]');
    if (toggleBtn) {
      e.preventDefault();
      openMobileNav();
    }
  });

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', closeMobileNav);
  }

  if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', closeMobileNav);
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && mobileDrawer && mobileDrawer.classList.contains('open')) {
      closeMobileNav();
    }
  });

  // Mobile Drawer Accordion Submenus
  document.querySelectorAll('.mobile-accordion-toggle').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('data-target');
      const panel = document.getElementById(targetId);
      if (panel) {
        const isExpanded = this.classList.contains('expanded');
        if (isExpanded) {
          this.classList.remove('expanded');
          panel.classList.remove('show');
        } else {
          this.classList.add('expanded');
          panel.classList.add('show');
        }
      }
    });
  });

  // Highlight Current Active Page Link in Mobile Drawer
  const currentPath = window.location.pathname;
  document.querySelectorAll('.mobile-drawer-body a').forEach(function(link) {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active-page');
      // If inside an accordion, open it
      const parentAccordion = link.closest('.mobile-accordion-panel');
      if (parentAccordion) {
        parentAccordion.classList.add('show');
        const trigger = document.querySelector(`.mobile-accordion-toggle[data-target="${parentAccordion.id}"]`);
        if (trigger) trigger.classList.add('expanded');
      }
    }
  });

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const el = document.querySelector(targetId);
        if (el) {
          e.preventDefault();
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
});

// Dynamic year in footer
const yearSpan = document.querySelector('footer p');
if (yearSpan) {
  const currentYear = new Date().getFullYear();
  yearSpan.innerHTML = yearSpan.innerHTML.replace('2025', currentYear);
}

// Dark mode toggle (example feature)
const darkModeToggle = document.getElementById('dark-mode-toggle');
if (darkModeToggle) {
  darkModeToggle.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
  });

  // Check for saved user preference
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
  }
}
document.addEventListener("DOMContentLoaded", () => {
  const forms = document.querySelectorAll(".auth-container form");

  forms.forEach(form => {
    form.addEventListener("submit", (e) => {
      const inputs = form.querySelectorAll("input[required]");
      let valid = true;

      inputs.forEach(input => {
        if (!input.value.trim()) {
          input.style.border = "1px solid red";
          valid = false;
        } else {
          input.style.border = "1px solid #ccc";
        }
      });

      if (!valid) {
        e.preventDefault();
        alert("Please fill all required fields!");
      }
    });
  });
});

// Hide loading overlay safely
function hideLoadingOverlay() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.opacity = '0';
    loadingOverlay.style.pointerEvents = 'none';
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
    }, 250);
  }
}
window.addEventListener('DOMContentLoaded', hideLoadingOverlay);
window.addEventListener('load', hideLoadingOverlay);
setTimeout(hideLoadingOverlay, 600);

// Push Notification Functions
function requestNotificationPermission() {
  if ('Notification' in window) {
    Notification.requestPermission().then(function(permission) {
      if (permission === 'granted') {
        console.log('Notification permission granted.');
        subscribeToNotifications();
      } else {
        console.log('Notification permission denied.');
      }
    });
  }
}

function unsubscribeFromNotifications() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.ready.then(function(registration) {
      registration.pushManager.getSubscription().then(function(subscription) {
        if (subscription) {
          subscription.unsubscribe().then(function(successful) {
            console.log('Successfully unsubscribed:', successful);
            fetch('/push/unsubscribe', {
              method: 'POST',
              body: JSON.stringify({ endpoint: subscription.endpoint }),
              headers: {
                'Content-Type': 'application/json'
              }
            });
          }).catch(function(error) {
            console.log('Failed to unsubscribe:', error);
          });
        }
      });
    });
  }
}

// Add notification button to page if supported
document.addEventListener('DOMContentLoaded', function() {
  if ('Notification' in window && 'serviceWorker' in navigator) {
    // Create notification permission button
    const notificationBtn = document.createElement('button');
    notificationBtn.id = 'notification-btn';
    notificationBtn.innerHTML = 'Enable Weather Alerts';
    notificationBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #007bff;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      z-index: 1000;
      display: none;
    `;

    if (Notification.permission === 'default') {
      notificationBtn.style.display = 'block';
      notificationBtn.addEventListener('click', requestNotificationPermission);
    } else if (Notification.permission === 'granted') {
      notificationBtn.innerHTML = 'Disable Weather Alerts';
      notificationBtn.style.display = 'block';
      notificationBtn.addEventListener('click', unsubscribeFromNotifications);
    }

    document.body.appendChild(notificationBtn);
  }
});
