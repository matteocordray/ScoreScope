function loadAccountManager() {
    $("#bottomLeftFab").click(onFabClick);

    ss.get(function (metadata) {
        accountMetadata = JSON.parse(metadata).accounts;
        console.info("Successfully updated metadata!");

        $("#loading").hide();

        var acctList = $("#accountList");
        acctList.fadeOut(FADE_TIME, function () {
            acctList.empty();
            $.each(accountMetadata, function (key, val) {
                // TODO: get rid of this onclick
                acctList.append('<ons-list-item tappable modifier="longdivider" class="card">' +
                    '<ons-col class="listLeft" width="85%">' + '<div class="friendlyName">' + val.name + '</div>' +
                    '<div class="username">' + val.login + '</div><div class="districtName">' + val.districtName + '</div></ons-col>' +
                    '<ons-col class="listRight" width="15%" onclick="loadEditor(' + key + ')"><ons-icon icon="fa-pencil" size="30px"></ons-icon></ons-col>' +
                    '</ons-list-item>');
            });
            acctList.fadeIn(FADE_TIME * 2);
        });
    }, function (error) {
        console.error("Error: " + error);
        displayErrorPage("#acctMgrErrMsgDiv", "Oh No!", "We couldn't load account information. Please try again later.", "ErrorCircle", function () {
            $("#acctMgrErrMsgDiv").fadeOut(ERR_FADE_TIME, loadAccountManager);
        });
    }, "accountMetadata");
}

function loadEditor(id) {
    var rightBtn = $("#rightBtn");
    var leftBtn = $("#leftBtn");

    rightBtn.children().eq(0).attr("class", "ons-icon fa fa-save"); // Must use children[0] because onsen ui makes a child icon element
    rightBtn.off("click.refresh click.save").on("click.save", function () {
        validateAndSave(id);
    });

    leftBtn.children().eq(0).attr("class", "ons-icon fa fa-arrow-left");
    leftBtn.off("click.toggleMenu click.goBack").on("click.goBack", goBack);

    document.addEventListener("backbutton", goBack, false);
    navi._backButtonHandler.disable();
    ons.disableDeviceBackButtonHandler();

    var editingAcct = accountMetadata[id];
    navi.pushPage("accounts/accountEditor.html", {
        animation: "lift",
        animationOptions: {duration: 0.25}
    }).then(function () {
        $("#editorLoading").hide();
        $("#editName").val(editingAcct.name);
        $("#editLogin").val(editingAcct.login);
        $("#editPassword").val(editingAcct.password);
        $("#editDistName").val(editingAcct.districtName);
        $("#editURL").val(editingAcct.url);
        $("#bottomLeftRemoveFab").click(function () {
            removeAcct(id);
        });
        $("#editList").fadeIn(FADE_TIME * 2);
    });
}

function validateAndSave(id) {
    var account = {};
    account.login = $("#editLogin").val().trim().toLowerCase();
    account.password = $("#editPassword").val().trim();
    account.name = $("#editName").val().trim();
    account.districtName = $("#editDistName").val().trim();
    account.url = $("#editURL").val().trim();

    // For parent accounts, we need to preserve studentId override
    if (accountMetadata[id].overrides) {
        account.overrides = accountMetadata[id].overrides;
    }

    if (account.name.length === 0) {
        alertMsg("Please enter a name for this account.");
        return;
    }
    if (account.districtName.length === 0) {
        alertMsg("Please enter a name for this account's district.");
        return;
    }
    if (account.url.charAt(account.url.length - 1) !== '/') {
        account.url += '/';
    }

    // Ensure user does not change account to an existing account
    var shownConfirm = false;
    for (var i = 0; i < accountMetadata.length; i++) {
        if (shownConfirm || i === id) {
            continue;
        }
        if (accountMetadata[i].login === account.login.toLowerCase() && accountMetadata[i].url === account.url) {
            shownConfirm = true;
            ons.notification.confirm({
                message: "You have already linked this Skyward® account to ScoreScope. Do you want to continue anyways?",
                buttonLabels: ["Yes", "No"],
                primaryButtonIndex: 0
            }).then(function (choice) {
                if (choice === 0) {
                    verifyCredentials();
                } else {
                    return;
                }
            });
        }
    }
    if (!shownConfirm) {
        verifyCredentials();
    }

    function verifyCredentials() {
        var skyportReq = $.post(account.url + "skyporthttp.w", {
            requestAction: "eel",
            codeType: "tryLogin",
            login: account.login,
            password: account.password
        }).done(function () {
            // Detect is credentials are invalid. Good credentials will cause the response to contain the username
            if (skyportReq.responseText.toLowerCase().indexOf("invalid login or password") > -1 || skyportReq.responseText.toLowerCase().indexOf(account.login) === -1) {
                alertMsg("Invalid credentials :(", "Error");
                $("#pw").val("");
                return;
            } else {
                var acctMD = {accounts: []};
                acctMD.accounts = accountMetadata.slice();
                acctMD.accounts[id] = account;
                ss.set(function (key) {
                    console.info("Successfully saved " + key);
                    loadAccountManager(); // Refresh account list
                    loadAcctList(id);
                    goBack();
                }, function (error) {
                    console.error("Error: " + error);
                    alertMsg("Failed to save account information. Please try again.", "Error");
                    return;
                }, "accountMetadata", JSON.stringify(acctMD));
            }
        }).fail(function (xhr) {
            console.error(xhr.statusCode());
            if (xhr.readyState === 0) {
                alertMsg("Please check your internet connection and try again.", "Error");
            } else {
                alertMsg("Please check your specified District URL and try again.", "Error");
            }
        });
    }
}

function goBack() {
    var rightBtn = $("#rightBtn");
    var leftBtn = $("#leftBtn");

    rightBtn.children().eq(0).attr("class", "ons-icon fa fa-refresh"); // Must use children[0] because onsen ui makes a child icon element
    rightBtn.off("click.save click.refresh").on("click.refresh", onResume);

    leftBtn.children().eq(0).attr("class", "ons-icon fa fa-bars");
    leftBtn.off("click.goBack click.toggleMenu").on("click.toggleMenu", function () {
        menu.toggle();
    });

    document.removeEventListener('backbutton', goBack, false);
    document.removeEventListener('backbutton', updateTitle, false); // Remove and re-add updateTitle listener to simulate reload

    navi._backButtonHandler.enable();
    ons.enableDeviceBackButtonHandler();
    document.addEventListener("backbutton", updateTitle, false);
    navi.popPage();
}

function onFabClick() {
    window.location.replace("accounts/firstRun.html");
}

function removeAcct(id) {
    var acctMD = {accounts: []};
    accountMetadata.splice(id, 1); // Remove element
    acctMD.accounts = accountMetadata.slice();
    ss.set(function (key) {
        console.info("Successfully saved " + key);
        if (accountMetadata.length == 0) { // If the user removed the last account
            loadAccountManager(); // Refresh account list
            goBack();

            ss.remove(function (key) { // If there's no more accounts, then we must remove account metadata
                console.info("Successfully removed " + key);
            }, function (error) {
                console.error("Error: " + error);
                alertMsg("Failed to update account database. Please try again later.", "Error");
            }, "accountMetadata");

            alertMsg("To use ScoreScope, you must have at least one account.", "", function () {
                window.location.replace("accounts/firstRun.html");
                return;
            });
        } else {
            loadAccountManager(); // Refresh account list
            loadAcctList();
            goBack();
        }
    }, function (error) {
        console.error("Error: " + error);
        alertMsg("Failed to update account database. Please try again later.", "Error");
        return;
    }, "accountMetadata", JSON.stringify(acctMD));
}
