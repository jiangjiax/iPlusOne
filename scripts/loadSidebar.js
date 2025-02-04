document.addEventListener('DOMContentLoaded', () => {
    fetch(chrome.runtime.getURL('templates/sidebar.html'))
        .then(response => response.text())
        .then(data => {
            document.getElementById('sidebar-container').innerHTML = data;
            setActiveNavItem();
        });
});

function setActiveNavItem() {
    const path = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (path.includes(href)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
} 