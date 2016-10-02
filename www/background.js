// TODO: see if we can get rid of acctData
function updateBGTask(gradeData, acctData, id) {
    if (settings.allowPush === null) { // If we haven't asked the user for permission, do so
        notifications.registerPermission(function (wasGranted) {
            settings.allowPush = wasGranted;
            saveSettings();

            if (wasGranted) {
                registerNotifications(id);
                updateBGTask(gradeData, acctData, id);
            }
            return;
        });
    }
    updateNotifications(id, gradeData);
}

function registerNotifications(id) {
    notifications.schedule({
        id: id,
        title: "Checking for new grades...",
        text: "... ... ...",
        firstAt: new Date(Date.now() + 60 * 60 * 1000), // One hour from now
        every: "hour"
    });
}

function cancelNotifications(id, callback) {
    notifications.cancel(id, callback);
}

function cancelAllNotifications(callback) {
    notifications.cancelAll(callback);
}

function updateNotifications(id, data) {
    notifications.update({
        id: id,
        firstAt: new Date(Date.now() + 60 * 60 * 1000), // One hour from now
        data: data
    });
}

function notificationTrigger(notification) {
    // TODO: Fix STUB
}
