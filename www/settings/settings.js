function settingsGo(pageName) {
    if (pageName === "delete") {
        ons.notification.confirm({
            message: "Are you sure you would like to completely reset ScoreScope and delete ALL data?",
            buttonLabels: ["Yes", "No"],
            primaryButtonIndex: 0
        }).then(function (choice) {
            switch (choice) {
                case 0: // YES
                    ss.remove(function () {
                        ss.remove(function () {
                            alertMsg("To use ScoreScope, you must have at least one account.", "", function () {
                                window.location.replace("accounts/firstRun.html");
                                return;
                            });
                        }, function (error) {
                            console.error("Error: " + error);
                            alertMsg("Failed to delete data. Please try again", "Error");
                        }, "settings");
                    }, function (error) {
                        console.error("Error: " + error);
                        alertMsg("Failed to delete data. Please try again", "Error");
                    }, "accountMetadata");
                    break;
                case 1: // NO
                    break;
                default:
                    console.warn("Invalid response " + choice + " received, expected 0 or 1");
                    alertMsg("It appears that you selected an invalid option. Please try again.", "Error");
                    break;
            }
        });
    } else {
        switch (pageName) { // prePop
            case "privacy":
                $("#title").text("Privacy Policy");
                break;
            case "tac":
                $("#title").text("Terms & Conditions");
                break;
            case "oss":
                $("#title").text("Open Source Libraries");
                break;
            default:
                console.warn("Unexpected page selected: " + pageName);
                break;
        }
        settingsNavi.pushPage("settings/" + pageName + ".html", {
            animation: "slide",
            animationOptions: {duration: transitionTime}
        }).then(function () { // postPop
            switch (settingsNavi.topPage.name) {
                case "settings/privacy.html":
                    updatePrivacy();
                    break;
                default: // Most pages don't have special stuff
                    break;
            }
        });
    }
}

function togglePrivacy() {
    settings.allowDiag = privacySwitch.checked;
    ss.set(function (key) { // On success
        console.info("Successfully updated " + key);
        // TODO: maybe send a report
    }, function (error) { // On error
        alertMsg("Failed to save settings. Please try again.", "Error");
        console.error("Failed to save settings. Error: " + error);
    }, "settings", JSON.stringify(settings));
}

function updatePrivacy() {
    ss.get(function (value) {
        settings = JSON.parse(value);
        privacySwitch.checked = settings.allowDiag;
    }, function (error) {
        console.error("Error retrieving settings from storage: " + error);
        console.warn("Assuming no settings stored! Resetting to defaults!");

        // This should be const but Safari doesn't support block-level const (I think)
        var defaultSettings = {
            allowDiag: true
        };
        ss.set(function (key) { // On success
            console.info("Successfully reset " + key + " to defaults");
            updatePrivacy(); // Try again after setting the defaults
        }, function (error) { // On error
            // Probably shouldn't bother notifying the user.
            console.error("Failed to set default settings! Error: " + error);

            // TODO: Send error log
        }, "settings", JSON.stringify(defaultSettings));
    }, "settings");
}
