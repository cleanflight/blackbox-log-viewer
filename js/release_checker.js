 'use strict;'

var ReleaseChecker = function (releaseName, releaseUrl) {
    var self = this;
    
    self._releaseName = releaseName;
    self._releaseDataTag = `${self._releaseName}ReleaseData`;
    self._releaseLastUpdateTag = `${self._releaseName}ReleaseLastUpdate`
    self._releaseUrl = releaseUrl;
    

}

ReleaseChecker.prototype.loadReleaseData = function (processFunction) {
    var self = this;
    chrome.storage.local.get([self._releaseLastUpdateTag, self._releaseDataTag], function (result) {
        var releaseDataTimestamp = $.now();
        var cacheReleaseData = result[self._releaseDataTag];
        var cachedReleaseLastUpdate = result[self._releaseLastUpdateTag];
        if (!cacheReleaseData || !cachedReleaseLastUpdate || releaseDataTimestamp - cachedReleaseLastUpdate > 3600 * 1000) {
            $.get(self._releaseUrl, function (releaseData) {
                GUI.log(`Loaded release information for ${self._releaseName} from GitHub.`);

                var data = {};
                data[self._releaseDataTag] = releaseData
                data[self._releaseLastUpdateTag] = releaseDataTimestamp
                chrome.storage.local.set(data, function () {});
                    
                self._processReleaseData(releaseData, processFunction);
            }).fail(function (data) {
                var message = '';
                if (data['responseJSON']) {
                    message = data['responseJSON'].message;
                }
                GUI.log(`<b>GitHub query for ${self._releaseName} releases failed, using cached information. Reason: <code>${message}</code></b>`);
            
                self._processReleaseData(cacheReleaseData, processFunction);
            });
        } else {
            if (cacheReleaseData) {
                GUI.log(`Using cached release information for ${self._releaseName} releases.`);
            }

            self._processReleaseData(cacheReleaseData, processFunction);
        }
    });
}
    

ReleaseChecker.prototype._processReleaseData = function (releaseData, processFunction) {
    if (releaseData) {
        processFunction(releaseData);
    } else {
        GUI.log(`No release information available for ${self._releaseName}.`);

        processFunction();
    }
}
