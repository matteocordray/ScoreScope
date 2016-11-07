var ss; // Secure storage plugin
var movingLock = false; // Prevent spamming next/back buttons

const PAGES = ["greetings", "district", "login"];
const TRANSITION_TIME = 0.325; // Time to reset page in seconds
const FADE_TIME = 150; // Time to fade in main page in milliseconds
const ERR_FADE_TIME = 200; // Time to fade in/out the error messages in milliseconds

var searchTimer;
const SEARCH_TYPING_TIMEOUT = 1500; // Time in ms to wait after user finishes typing
const KEY_CODE_ENTER = 13;

var accountMetadata;
var account = {
    login: null, password: null, url: null, name: null
};

//The main deal
ons.forcePlatformStyling("ios"); // Forces iOS design on all platforms
$(document).ready(function () {

    if (cordova.platformId === "windows") { // Override onerror to avoid crash on console.error()
        window.onerror = function () {
            return true;
        }
    }

    ons.ready(function () {
        $("#back").click(backPage);
        $("#next").click(advancePage);

        // Android only: Workaround viewport height changing when keyboard present
        if (cordova.platformId.toLowerCase() === "android") {
            $("head").prepend('<meta name="viewport" content="width=device-width,height=' + window.innerHeight + ', initial-scale=1.0">');
        }

        // Initialize secure storage and get data
        ss = new cordova.plugins.SecureStorage(
            function () {
                console.info("Secure storage init complete!");
                ss.get(function (metadata) {
                    accountMetadata = JSON.parse(metadata);
                    console.info("Successfully retrieved metadata!")
                }, function (error) {
                    console.error("Error: " + error);
                    accountMetadata = {accounts: []};
                }, "accountMetadata");
            },
            function (error) {
                console.error("Error: " + error);
            },
            "scorescope" // Key for storage.
        );
    });
});

// Wrapper for ons.notification.alert()
function alertMsg(text, title, callback) {
    ons.notification.alert({
        title: title,
        message: text,
        callback: callback
    });
}

function showFirstRunError(errorTitle, errorContent, errorIcon, retryCallback) {
    $("#FRErrTitle").text(errorTitle);
    $("#FRErrDetails").text(errorContent);

    var frERB = $("#FRErrRetryBtn");
    frERB.hide();
    if (typeof retryCallback === "function") {
        frERB.show();
        frERB.unbind("click").on("click", retryCallback); // Prevent multiple retryCallbacks being added
    }

    if (errorIcon) {
        $("#FRErrIconSvg").attr("src", "../lib/img/" + errorIcon + ".svg");
    }

    $("#loading").fadeOut(ERR_FADE_TIME, function () {
        $("#firstRunErrDiv").fadeIn(ERR_FADE_TIME);
    });
}

function isNumber(number) {
    return !isNaN(parseFloat(number)) && isFinite(number);
}

function backPage() {
    if (movingLock) {
        return;
    }

    $("#next").fadeIn(FADE_TIME);

    if (navi.topPage.name === PAGES[0]) { // If it's the first page, early exit
        return;
    }

    if (navi.topPage.name === PAGES[1]) { // If it's the second page, hide the back button
        $("#back").fadeOut(FADE_TIME);
    }

    movingLock = true;
    navi.popPage({
        animation: "slide",
        animationOptions: {duration: TRANSITION_TIME}
    }).then(function () {
        movingLock = false;
    });
}

function advancePage() {
    if (movingLock) {
        return;
    }

    if (navi.topPage.name === PAGES[PAGES.length - 1] && tcCheckBox.checked) { // If last page
        validateAndGo();
        return;
    }

    $("#next").fadeOut(FADE_TIME);
    $("#firstRunErrDiv").fadeOut(ERR_FADE_TIME);

    $("#back").fadeIn(FADE_TIME);
    movingLock = true;
    navi.pushPage(PAGES[PAGES.indexOf(navi.topPage.name) + 1], {
        animation: "slide",
        animationOptions: {duration: TRANSITION_TIME}
    }).then(function () {
        movingLock = false;

        // If user is navigating to the district finder, activate keyUp handler
        if (navi.topPage.name === "district") {
            $('#search').keyup(function () {
                $(".district, #firstRunErrDiv").fadeOut(ERR_FADE_TIME, function () { // Extra long fadeOut because list.empty takes a while
                    $("#list").empty();
                });

                $("#next").fadeOut(FADE_TIME);

                clearTimeout(searchTimer);

                if ($("#search").val().trim().length < 3) { // If the search term is really short, it's probably not an actual search
                    return;
                }

                if ($('#myInput').val) {
                    $("#loading").fadeIn(FADE_TIME * 2); // Longer FADE_TIME because searching takes a while
                    searchTimer = setTimeout(searchForDist, SEARCH_TYPING_TIMEOUT);
                }
            });

            $("#search").keypress(function (e) {
                if (e.keyCode === KEY_CODE_ENTER) {
                    clearTimeout(searchTimer);
                    $("#loading").fadeIn(FADE_TIME);
                    searchForDist();
                }
            });
        } else if (navi.topPage.name === "login") {
            $("#domain").text(account.districtName);

            // Add the handler for the tcCheckBox to toggle the next button
            $("#tc").click(function () {
                if (tcCheckBox.checked) {
                    $("#next").fadeIn(FADE_TIME);
                } else {
                    $("#next").fadeOut(FADE_TIME);
                }
            });
        }
    });
}

function searchForDist() {
    var searchTerm = $("#search").val().trim();

    if (searchTerm.toLowerCase() === "appreview124") {
        var data = {
            name: "Test District",
            studentURL: "http://162.243.217.157:8085/testing/seplog01.w",
            city: "Anycity",
            state: "Anystate"
        };

        $("#loading").fadeOut(FADE_TIME, function () {
            var testDistrict = $('<ons-list-item tappable class="district" modifier="longdivider">' +
                '<ons-col class="distCol">' + // Column
                '<div class="distName">' + data.name + '</div>' + // District Name
                '<div class="distLoc">' + data.city + ' ' + data.state + '</div>' + // City + State
                '</ons-col></ons-list-item>'
            );

            $("#list").append(testDistrict);

            testDistrict.on("click", function () {
                selectDistrict(data, 0);
            });
        });
        return;
    }

    if (isNumber(searchTerm) && searchTerm.length === 5) { // If it's a postal code
        $.soap({
            url: "http://rms.skyward.com/rmswebservices/Company/GPSfromZip.asmx",
            method: "GetGPSfromZip",
            namespaceURL: "http://tempuri.org/",
            appendMethodToURL: false,
            soap12: true,
            data: {
                zip: searchTerm
            },
            success: function (soapResponse) { // If server sends a successful response
                // Should return GPS coordinates
                var response = soapResponse.toJSON()["#document"]["soap:Envelope"]["soap:Body"].GetGPSfromZipResponse.GetGPSfromZipResult;
                if (response === "") {
                    showFirstRunError("Whoops!", "It seems like that zip code is invalid. Please try another.", "NotFound", null);
                    return;
                } else {
                    response = response.ZipGPSInfo;
                    $.soap({
                        url: "http://rms.skyward.com/rmswebservices/Company/AllCompanyByRadius.asmx",
                        method: "CompanyDistanceQueryAll",
                        namespaceURL: "http://tempuri.org/",
                        appendMethodToURL: false,
                        soap12: true,
                        data: {
                            latitudeHome: response.latitude,
                            longitudeHome: response.longitude,
                            radiusMiles: "50" // TODO: maybe make this configurable
                        },
                        success: function (soapResponse) { // If the request succeeds and the server returns a successful response
                            generateHTMLFromDistricts(soapResponse, "fromLoc");
                        },
                        error: function (errorSOAPResponse) { // If the request succeeds but the server returns an error
                            console.error("SOAP Error: " + errorSOAPResponse);
                            showFirstRunError("Oh No!", "We couldn't search by zip code. Try searching by name.", "ErrorCircle", null);
                        }
                    }).fail(function (jqXHR, textStatus, errorThrown) { // If the ajax request fails
                        console.error("Network Error: ", textStatus, errorThrown);
                        if (xhr.readyState === 0) { // readyState = 0 means no internet connection
                            showFirstRunError("Oh No!", "We couldn't establish a connection. Please check your internet connection and try again.", "ErrorTriangle", function () {
                                $("#firstRunErrDiv").fadeOut(ERR_FADE_TIME, searchForDist);
                            });
                        } else {
                            showFirstRunError("Oh No!", "We couldn't connect to the server (HTTP " + jqXHR.status + "). Please try again later.", "ErrorTriangle", function () {
                                $("#firstRunErrDiv").fadeOut(ERR_FADE_TIME, searchForDist);
                            });
                        }
                    });
                }
            },
            error: function (errorSOAPResponse) { // If request succeeds but server returns an error
                console.error("SOAP Error: " + errorSOAPResponse);
                showFirstRunError("Oh No!", "We couldn't search by zip code. Try searching by name.", "ErrorCircle", null);
            }
        }).fail(function (jqXHR, textStatus, errorThrown) { // If the ajax request fails
            console.error("Network Error: ", textStatus, errorThrown);
            if (xhr.readyState === 0) { // readyState = 0 means no internet connection
                showFirstRunError("Oh No!", "We couldn't establish a connection. Please check your internet connection and try again.", "ErrorTriangle", function () {
                    $("#firstRunErrDiv").fadeOut(ERR_FADE_TIME, searchForDist);
                });
            } else {
                showFirstRunError("Oh No!", "We couldn't connect to the server (HTTP " + jqXHR.status + "). Please try again later.", "ErrorTriangle", function () {
                    $("#firstRunErrDiv").fadeOut(ERR_FADE_TIME, searchForDist);
                });
            }
        });
    } else if (searchTerm.length > 0) { // Assume it's the name of a school if search term is not empty
        $.soap({
            url: "http://rms.skyward.com/rmswebservices/company/allcompanybyname.asmx",
            method: "CompanyNameQuery",
            namespaceURL: "http://tempuri.org/",
            appendMethodToURL: false,
            soap12: true,
            data: {
                companySearchString: searchTerm
            },
            success: function (soapResponse) { // Successful request and server response
                generateHTMLFromDistricts(soapResponse, "fromName");
            },
            error: function (errorSOAPResponse) { // Successful request, but bad server response
                console.error("SOAP Error: " + errorSOAPResponse);
                showFirstRunError("Oh No!", "We couldn't search by district name. Try searching by zip code.", "ErrorCircle", null);
            }
        }).fail(function (jqXHR, textStatus, errorThrown) { // If the ajax request fails
            console.error("Network Error: ", textStatus, errorThrown);
            if (xhr.readyState === 0) { // readyState = 0 means no internet connection
                showFirstRunError("Oh No!", "We couldn't establish a connection. Please check your internet connection and try again.", "ErrorTriangle", function () {
                    $("#firstRunErrDiv").fadeOut(ERR_FADE_TIME, searchForDist);
                });
            } else {
                showFirstRunError("Oh No!", "We couldn't connect to the server (HTTP " + jqXHR.status + "). Please try again later.", "ErrorTriangle", function () {
                    $("#firstRunErrDiv").fadeOut(ERR_FADE_TIME, searchForDist);
                });
            }
        });
    }

    // Helper function that generates ons-list from soapResponse
    function generateHTMLFromDistricts(soapResponse, initiator) {
        if (initiator === "fromLoc") {
            var result = soapResponse.toJSON()["#document"]["soap:Envelope"]["soap:Body"].CompanyDistanceQueryAllResponse.CompanyDistanceQueryAllResult;
            if (result != "") { // If results found
                var data = result.CompanyDistanceInfo;
            } else { // No results found
                showFirstRunError("No Results Found", "We couldn't find any results matching your query.", "NotFound", null);
                $("#loading").fadeOut(FADE_TIME * 2); // Twice as long because network IO
                $("#next").fadeOut(FADE_TIME);
                return;
            }
        } else { // Must be from name
            var result = soapResponse.toJSON()["#document"]["soap:Envelope"]["soap:Body"].CompanyNameQueryResponse.CompanyNameQueryResult;
            if (result != "") { // If results found
                var data = result.CompanyNameInfo;
            } else { // No results found
                showFirstRunError("No Results Found", "We couldn't find any results matching your query.", "NotFound", null);
                $("#loading").fadeOut(FADE_TIME * 2);
                $("#next").fadeOut(FADE_TIME);
                return;
            }
        }
        $("#loading").fadeOut(FADE_TIME * 2, function () {
            var list = $("#list");
            if (!Array.isArray(data)) { // Workaround for if there is only one result
                data = [data];
            }
            $.each(data, function (key, val) {
                var districtItem = $('<ons-list-item tappable class="district" modifier="material longdivider">' +
                    '<ons-col class="distCol">' + // Column
                    '<div class="distName">' + val.name + '</div>' + // District Name
                    '<div class="distLoc">' + val.city + ' ' + val.state + '</div>' + // City + State
                    '</ons-col></ons-list-item>');

                list.append(districtItem);
                if (val.allowStu === "true") {
                    districtItem.on("click", function () {
                        selectDistrict(val, key);
                    });
                } else {
                    districtItem.on("click", function () {
                        confirmAllowStuOverride(val, key);
                    });
                }
            });
        });
    }
}

function selectDistrict(district, id) {
    account.url = district.studentURL.substr(0, district.studentURL.lastIndexOf("/") + 1); // Strips ending "bar.w" file, changing "foo/bar.w" to "foo/"
    account.districtName = district.name;
    $(".district").removeClass("selectedDistrict"); // Clears selected
    $(".district").eq(id).addClass("selectedDistrict"); // Selects district
    $("#next").fadeIn(FADE_TIME);
}

function confirmAllowStuOverride(district, id) {
    if (district.studentURL.length > 0) {
        ons.notification.confirm({
            message: "Your district administrator has not enabled mobile access. Some parts of ScoreScope may not function correctly. Would you like to continue anyways?",
            buttonLabels: ["Yes", "No"],
            primaryButtonIndex: 0
        }).then(function (response) {
            if (response === 0) {
                selectDistrict(district, id);
            }
        });
    } else {
        alertMsg("Your district administrator has not enabled mobile access. Please contact your district's Skyward administrator for more details.");
    }
}

function validateAndGo() {
    account.login = $("#user").val().trim().toLowerCase();
    account.password = $("#pw").val().trim();
    account.name = $("#name").val().trim();

    if (account.name.length === 0) {
        alertMsg("Please enter a name for this account.");
        return;
    }

    // Prevent user from linking multiple accounts w/ same username
    // Note that this is slightly different than the one in accountManager.js as it uses accountMetadata.accounts vs
    //      just accountMetadata
    var shownConfirm = false;
    for (var i = 0; i < accountMetadata.accounts.length; i++) {
        if (shownConfirm) {
            continue;
        }

        if (accountMetadata.accounts[i].login === account.login.toLowerCase() && accountMetadata.accounts[i].url === account.url) {
            shownConfirm = true;
            ons.notification.confirm({
                message: "You have already linked this Skyward® account to ScoreScope. Do you want to continue anyways?",
                buttonLabels: ["Yes", "No"],
                primaryButtonIndex: 0
            }).then(function (choice) {
                if (choice === 0) {
                    verifyCredentials(function () {
                        window.location.replace("../index.html");
                    });
                } else {
                    return;
                }
            });
        }
    }
    if (!shownConfirm) {
        verifyCredentials(function () {
            window.location.replace("../index.html");
        });
    }

    function verifyCredentials(callback) {
        var skyportReq = $.post(account.url + "skyporthttp.w", {
            requestAction: "eel",
            codeType: "tryLogin",
            login: account.login,
            password: account.password
        }).done(function () {
            var split = skyportReq.responseText.split("^");

            /*
             If it's a parent account, split[6] will be 1. Student accounts have split[6] as 2.
             Alternatively, if account.overrides is set, then assume it's a child account
             */
            if (isNumber(split[6]) && +split[6] === 1 && typeof account.overrides === "undefined") {
                findStudentsFromParent({
                    dwd: split[0].substr(4),
                    wfaacl: split[3]
                });
                return;

                // Detect is credentials are invalid. Good credentials will cause the response to contain the username
            } else if (skyportReq.responseText.toLowerCase().indexOf("invalid login or password") > -1 || split[5].toLowerCase().indexOf(account.login) === -1) {
                alertMsg("We couldn't validate your credentials. Please verify that your username and password are correct.", "Error");
                $("#pw").val("");
                return;
            } else {
                accountMetadata.accounts.push($.extend(true, {}, account));
                ss.set(function (key) {
                    console.info("Successfully saved " + key);
                }, function (error) {
                    console.error("Error: " + error);
                    alertMsg("Failed to save account information. Please try again.", "Error");
                    return;
                }, "accountMetadata", JSON.stringify(accountMetadata));
                if (typeof callback === "function") {
                    callback();
                }
            }
        }).fail(function (xhr) {
            if (xhr.readyState === 0) {
                alertMsg("Please check your internet connection and try again.", "Error");
            } else {
                alertMsg("We couldn't validate your account information. This may be a temporary server-side issue. Please try again later.", "Error");
            }
        });
    }

    function findStudentsFromParent(parentAcct) {
        var familyReq = $.post(account.url + "familyaccess.w", parentAcct).done(function () {
            var page = $(new DOMParser().parseFromString(familyReq.responseText, "text/html"));

            var box = page.find(".myBox");

            if (box.length < 1) {
                alertMsg("Unfortunately, the server sent a malformed response. Please try again.", "Error");
            }

            function verifyStudent(i) {
                var link = box.find("#link" + i)[0];

                if (!link) {
                    window.location.replace("../index.html");
                    return;
                }

                account.overrides = {
                    studentID: $(link.firstChild.firstChild.firstChild.firstChild).attr("onclick").split("\"")[3]
                };

                // Technically this could be an issue if somebody names their account "X Child #)
                if (account.name.indexOf(" Child #") > 0) {
                    account.name = account.name.substr(0, account.name.length - 1) + (+account.name.charAt(account.name.length - 1) + 1)
                } else {
                    account.name += " Child #" + i;
                }

                verifyCredentials(function () {
                    verifyStudent(i + 1);
                });
            }

            verifyStudent(1);

        }).fail(function (xhr) {
            if (xhr.readyState === 0) {
                alertMsg("Please check your internet connection and try again.", "Error");
            } else {
                alertMsg("We couldn't validate your account information. This may be a temporary server-side issue. Please try again later.", "Error");
            }
        });
    }
}
