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
            animationOptions: {duration: TRANSITION_TIME}
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
    saveSettings();
}

function updatePrivacy() {
    privacySwitch.checked = settings.allowDiag;
}
