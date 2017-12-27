'use strict';

function startApplication() {
    chrome.app.window.create('index.html', {
        id: 'main',
        frame: 'chrome',
        innerBounds : {
            'width' : 1340,
            'height' : 920
        },
        icon: 'images/cf_icon_128.png'
    });
}

chrome.app.runtime.onLaunched.addListener(startApplication);
