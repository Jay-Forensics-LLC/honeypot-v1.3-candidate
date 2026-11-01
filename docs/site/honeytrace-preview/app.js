'use strict';

const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(tab, focus = false) {
    for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus();
}

tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
        const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (target !== null) {event.preventDefault(); selectTab(tabs[target], true);}
    });
});

document.querySelectorAll('.preview-image img').forEach(image => {
    const show = () => {
        if (!image.naturalWidth) return;
        image.hidden = false;
        image.nextElementSibling.hidden = true;
    };
    image.addEventListener('load', show);
    image.addEventListener('error', () => {image.hidden = true; image.nextElementSibling.hidden = false;});
    if (image.complete) show();
});
