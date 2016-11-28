var accountMetadata;
var settings;
var ss; // Secure storage plugin
var currentDWD, currentWFAACL, currentStudentID, currentAcctURL; //workaround; we should get rid of this eventually
var currentAcctData;
var currentAcctID;

const TIMEOUT = 30000; // Default timeout in milliseconds
const TRANSITION_TIME = 0.325; // Time to reset page in seconds
const FADE_TIME = 150; // Time to fade in main page in milliseconds
const ERR_FADE_TIME = 200; // Time to fade in/out the error messages in milliseconds
const VERSION = "1.10.1";
const DEFAULT_SETTINGS = {
    allowDiag: true,
    version: VERSION
};

// Begin with some setup.
ons.forcePlatformStyling("android"); // Forces material design, even on non-android platforms

// Override onerror to avoid crash on console.error()
if (cordova.platformId === "windows") {
    window.onerror = function () {
        return true;
    }
}

// Nasty and unrecommended hack to set a timeout.
// TODO: fix this shit
$.ajaxSetup({
    timeout: TIMEOUT
});

// The Main Thing
$(document).ready(function () {
    ons.ready(function () {
        // Begin by adding some click handlers
        $("#rightBtn").on("click.refresh", onResume); // Default behavior for rightBtn is refresh
        $("#leftBtn").on("click.toggleMenu", function () { // Default behavior for leftBtn is toggle hamburger
            menu.toggle();
        });

        $("#settingsBtn").one("click.loadSettingsScript", function () {
            $.getScript("settings/settings.js", function () {
                $("#settingsBtn").on("click.goToSettings", goToSettings);
                goToSettings();
            });
        });

        $("#acctMgr").one("click.loadAcctMgrScript", function () {
            $.getScript("accounts/accountManager.js", function () {
                $("#acctMgr").on("click.goToAcctMgr", goToAcctMgr);
                goToAcctMgr();
            });
        });

        // Initialize SecureStorage plugin and get metadata
        ss = new cordova.plugins.SecureStorage(function () { // Upon successful initialization of SS plugin
            console.info("Secure storage init complete!");
            ss.get(function (metadata) { // Upon successful retrieval of metadata
                accountMetadata = JSON.parse(metadata).accounts;
                console.info("Successfully retrieved metadata!");

                loadAcctList();

                document.addEventListener("resume", onResume, false);
                document.addEventListener("backbutton", updateTitle, false);

                // Now that everything is loaded, we can ask the user for a review
                AppRate.preferences.displayAppName = "ScoreScope";
                AppRate.preferences.useLanguage = "en";
                AppRate.preferences.storeAppURL = {
                    ios: "1144199223",
                    android: "market://details?id=com.albertzhang.scorescope",
                    windows: "ms-windows-store://pdp/?ProductId=9NBLGGH515N6"
                };
                AppRate.preferences.openStoreInApp = true; // HACK? TODO: Investigate
                AppRate.promptForRating(false); // need false parameter to respect user decline
            }, function (error) { // If there's an error in the initialization process, fuck it and make user log in again
                console.error(error);
                console.warn("Error in initialization process...making user log in again!");

                // Try to remove the metadata
                ss.remove(function () { // On successful removal of metadata
                    window.location.replace("accounts/firstRun.html");
                }, function (error) { // On failure
                    console.error(error);
                    window.location.replace("accounts/firstRun.html");
                }, "accountMetadata");
            }, "accountMetadata");

            /*
             Ok. So we've successfully initialized the SS plugin. While we load the account via loadAcctData(), we
             simultaneously retrieve settings as well. Hopefully, we finish before we need any settings values.
             */
            ss.get(function (settingsJSON) { // Upon successful retrieval of settings
                settings = JSON.parse(settingsJSON);
                console.info("Successfully retrieved settings!");

                if (typeof settings.version === "undefined" || compareVersions(settings.version, VERSION) !== 0) {
                    console.info("Settings are out of date! Upgrading to " + VERSION);

                    // Merge settings with default settings, with settings having priority
                    settings = $.extend({}, DEFAULT_SETTINGS, settings);

                    // However, override version number to latest
                    settings.version = DEFAULT_SETTINGS.version;

                    saveSettings(); // Finally, save settings in secure storage
                }
            }, function (error) { // If there's an error in retrieving settings, set settings to defaults
                console.warn(error);
                console.warn("Could not retrieve settings...resetting to defaults");
                saveSettings(DEFAULT_SETTINGS);
            }, "settings");
        }, function (error) { // Upon failure in initializing secure storage
            console.error("Error: " + error);
            displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "Failed to initialize secure storage. Please try again later.", "ErrorTriangle", null);
        }, "scorescope"); // Key for storage
    });
});

/* Various listeners and stuff go here */
function onResume() { // Treat resuming like a fresh open
    /* Basically a copy of the goBack() function without the popPage
     * It basically resets buttons and event listeners */
    if (typeof goBack === "function") { // If goBack is not defined, this code need not be executed as the user has not visited the account editor yet
        var rightBtn = $("#rightBtn");
        var leftBtn = $("#leftBtn");

        rightBtn.children().eq(0).attr("class", "ons-icon fa fa-refresh"); // Must use .eq(0) because Onsen UI makes a child icon element
        rightBtn.off("click.save click.refresh").on("click.refresh", onResume); // Replace click listener

        leftBtn.children().eq(0).attr("class", "ons-icon fa fa-bars");
        leftBtn.off("click.goBack click.toggleMenu").on("click.toggleMenu", function () {
            menu.toggle();
        });

        document.removeEventListener("backbutton", goBack, false);
        document.removeEventListener("backbutton", updateTitle, false); // Remove and re-add updateTitle listener to simulate reload

        navi._backButtonHandler.enable();
        ons.enableDeviceBackButtonHandler();
        document.addEventListener("backbutton", updateTitle, false);
    } // End goBack()

    $("#goalDialog").hide(); // hide without animation

    $("#title").text("Gradebook");
    navi.resetToPage("mainPage", {
        animation: "lift",
        animationOptions: {duration: TRANSITION_TIME}
    }).then(function () {
        loadAcctList(currentAcctID);
    });
}

function updateTitle() { // Updates Title. Is run after navi pops the page
    // If there are less than two pages, do nothing
    if (navi.pages.length < 2) {
        return;
    }

    var nextInStack = navi.pages[navi.pages.length - 2].name.toLowerCase(); // Eg. mainpage, accounts/accountmanager.html, etc.
    var title = $("#title");

    switch (nextInStack) {
        case "mainpage":
            title.text("Gradebook");
            break;
        case "settings/settings.html":
            title.text("Settings");
            break;
        default:
            break;
    }
}

function saveSettings(optionalSettings) {
    ss.set(function (key) { // On success
        console.info("Successfully updated " + key);
    }, function (error) { // On error
        alertMsg("Failed to save settings. Please try again.", "Error");
        console.error("Failed to save settings. Error: " + error);
    }, "settings", JSON.stringify(typeof optionalSettings === "undefined" ? settings : optionalSettings));
}

function saveAcctMetadata(optionalMetadata, callback) {
    var accountMD = {
        accounts: optionalMetadata ? optionalMetadata : accountMetadata
    };

    ss.set(function (key) { // On success
        console.info("Successfully updated " + key);
    }, function (error) { // On error
        alertMsg("Failed to save account metadata. Please try again.", "Error");
        console.error("Failed to save account metadata. Error: " + error);
    }, "accountMetadata", JSON.stringify(accountMD));
    if (callback) {
        callback();
    }
}

function goToSettings() {
    menu.close();

    if (navi.topPage.name.substr(0, "settings/".length) === "settings/") { // If navi is on one of the settings pages...
        if (navi.topPage.name !== "settings/settings.html") { // ...but not on the main settings page...
            navi.popPage().then(updateTitle); // ...then pop the page and update the title
        }
        return;
    }

    navi.resetToPage("settings/settings.html", {
        animation: "slide",
        animationOptions: {duration: TRANSITION_TIME}
    }).then(function () { // Must use .then() because settings dom is not loaded until animation completes
        navi.insertPage(0, "mainPage").then(function () {
            loadAcct(currentAcctData); // Ensure that user can always back out
        });
    });
    $("#title").text("Settings");
}

function goToAcctMgr() {
    menu.close();

    if (navi.topPage.name === "accounts/accountManager.html" || navi.topPage.name === "accounts/accountEditor.html") {
        loadAccountManager();
        return;
    }

    navi.resetToPage("accounts/accountManager.html", {
        animation: "slide",
        animationOptions: {duration: TRANSITION_TIME}
    }).then(function () {
        loadAccountManager();

        navi.insertPage(0, "mainPage").then(function () {
            loadAcct(currentAcctData);
        });
    });
    $("#title").text("Accounts");
}

/* Some helper methods and stuff that makes life easier */

// Basically a wrapper over ons.notification.alert()
function alertMsg(text, title, callback) {
    ons.notification.alert({
        title: title,
        message: text,
        callback: callback
    });
}

function promptForGoal() {
    var goalInput = $("#goalInput")[0];
    var failingInput = $("#failingInput")[0];

    $("#goalCancelBtn").one("click.cancelGoal", function () {
        $("#goal").off("click.promptForGoal").one("click.promptForGoal", promptForGoal);
        goalDialog.hide();
    });

    $("#goalOKBtn").one("click.setGoal", function () {
        if (isNumber(goalInput.value) && isNumber(failingInput.value)) {
            // Protect against weird user input
            var goalVal = Math.ceil(goalInput.value);
            var failingVal = Math.ceil(failingInput.value);

            if (goalVal < failingVal) {
                var tmp = goalVal;
                goalVal = failingVal;
                failingVal = tmp;
            }
            if (goalVal === failingVal) {
                failingVal--;
            }

            accountMetadata[currentAcctID].goal = goalVal;
            accountMetadata[currentAcctID].failing = failingVal;
        } else {
            accountMetadata[currentAcctID].goal = returnUndefined();
            accountMetadata[currentAcctID].failing = returnUndefined();
        }

        goalDialog.hide();
        saveAcctMetadata(null, onResume);
    });

    goalDialog.show();
}

function displayErrorPage(selector, errorTitle, errorContent, errorIconType, retryCallback) {
    $(selector + " > .errorTitle").text(errorTitle);
    $(selector + " > .errorDetails").text(errorContent);

    var erb = $(selector + " > .errorRetryBtn");
    erb.hide();
    if (typeof retryCallback === "function") {
        erb.show();
        erb.off("click.retry").on("click.retry", retryCallback); // Prevent multiple retryCallbacks being added
    }

    if (errorIconType) {
        $(selector + " > .errorIcon").attr("src", "lib/img/" + errorIconType + ".svg");
    }

    // Use when selector so that callback gets called once even if there are multiple loadingCircles
    $.when($(".loadingCircle").fadeOut(ERR_FADE_TIME)).then(function () {
        $(selector + ".errorMsgDiv").fadeIn(ERR_FADE_TIME);
    });
}

//noinspection MagicNumberJS,OverlyComplexFunctionJS
function convertToGPA(grade) {
    if (grade >= 93) {
        return 4.0;
    } else if (grade >= 90) {
        return 3.7;
    } else if (grade >= 87) {
        return 3.3;
    } else if (grade >= 83) {
        return 3.0;
    } else if (grade >= 80) {
        return 2.7;
    } else if (grade >= 77) {
        return 2.3;
    } else if (grade >= 73) {
        return 2.0;
    } else if (grade >= 70) {
        return 1.7;
    } else if (grade >= 67) {
        return 1.3;
    } else if (grade >= 65) {
        return 1.0;
    } else {
        return 0.0;
    }
}

function compareVersions(a, b) {
    var i, diff;
    var regExStripZeros = /(\.0+)+$/;
    var segmentsA = a.replace(regExStripZeros, '').split('.');
    var segmentsB = b.replace(regExStripZeros, '').split('.');
    var l = Math.min(segmentsA.length, segmentsB.length);

    for (i = 0; i < l; i++) {
        diff = parseInt(segmentsA[i], 10) - parseInt(segmentsB[i], 10);
        if (diff) {
            return diff;
        }
    }
    return segmentsA.length - segmentsB.length;
}

function isNumber(number) {
    return typeof number !== "undefined" && !isNaN(parseFloat(number)) && isFinite(number);
}

function ensureRange(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function returnUndefined() {
    return;
}

/**
 * Taken from:
 * * http://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
 */
function colorFromGrade(grade) {
    //noinspection NestedFunctionJS
    function hslToRgb(h, s, l) {
        var r, g, b;
        if (s == 0) {
            r = g = b = l; // achromatic
        } else {
            //noinspection FunctionNamingConventionJS,NestedFunctionJS
            function hue2rgb(p, q, t) {
                if (t < 0) {
                    t += 1;
                }
                if (t > 1) {
                    t -= 1;
                }
                if (t < 1 / 6) {
                    return p + (q - p) * 6 * t;
                }
                if (t < 1 / 2) {
                    return q;
                }
                if (t < 2 / 3) {
                    return p + (q - p) * (2 / 3 - t) * 6;
                }
                return p;
            }

            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
    }

    var hue = grade * 1.2 / 360;
    var rgb = hslToRgb(hue, 0.7, 0.6);
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
}

/**
 * Taken from:
 *  http://stackoverflow.com/questions/5560248/programmatically-lighten-or-darken-a-hex-color-or-rgb-and-blend-colors
 */
function lightenColor(color, percent) {
    //noinspection LocalVariableNamingConventionJS,MagicNumberJS
    var f = parseInt(color.slice(1), 16), t = percent < 0 ? 0 : 255, p = percent < 0 ? percent * -1 : percent, R = f >> 16, G = f >> 8 & 0x00FF, B = f & 0x0000FF;
    return "#" + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
}

/* The following functions load things */

// Parameter optionalAcctToLoad is a number that if supplied, will cause that account to load instead of account 0
function loadAcctList(optionalAcctToLoad) {
    var menuList = $("#menuList");
    menuList.empty();
    menuList.append('<ons-list-header>Accounts</ons-list-header>');

    $.each(accountMetadata, function (key, val) { // Loads stuff in accounts list and populates hamburger menu
        var listItem = $('<ons-list-item tappable modifier="longdivider">' + val.name + '</ons-list-item>');

        menuList.append(listItem);

        listItem.on("click.loadAcct", function () {
            getAndParseAccount(key, loadAcct);
        });
    });
    getAndParseAccount(optionalAcctToLoad ? optionalAcctToLoad : 0, loadAcct, true); // Loads the specified account in data without creating a new page. If none provided, loads first acct.
}

function getAndParseAccount(id, callback, doNotResetPage) {
    currentAcctID = id;

    $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME);

    var resetPage = !doNotResetPage;

    // Workarounds because dom loading is after animations, but retrieval of data may take longer than animation
    var finishedRetrieving = false;
    var finishedAnimation = false;

    currentAcctData = null;
    var dataOut;

    $("#title").text("Gradebook"); // Change title text
    menu.close();
    $("#mainLoading").fadeIn(FADE_TIME);

    if (resetPage) { // If we *ARE* supposed to reset the page
        navi.resetToPage("mainPage", {
            animation: "lift",
            animationOptions: {duration: TRANSITION_TIME}
        }).then(function () {
            finishedAnimation = true;
            $(".fade").hide(); // Hide stuff that needs to fade in
            if (finishedRetrieving) { // If the app has retrieved the data before the page resets, load data after reset
                currentAcctData = dataOut;
                callback(dataOut);
                return;
            }
        });
    } else {
        finishedAnimation = true;
        $(".fade").hide();
    }

    var acct = accountMetadata[id];

    // skyportReq sends username, password, and some constants, retrieves DWD, WFAACL, and studentID
    var skyportReq = $.post(acct.url + "skyporthttp.w", {
        requestAction: "eel",
        codeType: "tryLogin",
        login: acct.login,
        password: acct.password
    }).done(function () {
        // Detect is credentials are invalid. Good credentials will cause the response to contain the username
        if (skyportReq.responseText.toLowerCase().indexOf("invalid login or password") > -1 || skyportReq.responseText.toLowerCase().indexOf(acct.login) === -1) {
            displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't authenticate with the server. Please verify your credentials and try again.", "ErrorCircle", function () {
                $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                    getAndParseAccount(id, callback, doNotResetPage);
                });
            });
            return;
        }
        var split = skyportReq.responseText.split("^"); // Why the fuck did they separate items using "^"? I have no clue

        // If this breaks the only solution is to reverse engineer the protocol again.
        currentDWD = split[0].substr(4); // Substring to get rid of initial <li>
        currentWFAACL = split[3];
        currentStudentID = split[4];
        currentAcctURL = acct.url;

        // Parent accounts override the studentID
        if (acct.overrides) {
            currentStudentID = acct.overrides.studentID;
        }

        // HACK to lower the scope of the parameters so we can use them in displayErrorPage() below
        var idX = id;
        var callbackX = callback;

        // After the first request completes, we send a second request to retrieve the actual grades
        var gradebookReq = $.post(acct.url + "gradebook.w", {
            dwd: currentDWD,
            wfaacl: currentWFAACL,
            currentStudent: currentStudentID
        }).done(function () {
            /*
             *  Now we parse the response and add it to dataOut
             *  If this code ever breaks, just give up and rewrite it. Don't even think of understanding it.
             *  Hopefully, if skyward gets their shit together, we can use their api instead
             */
            dataOut = {
                name: acct.name,
                goal: acct.goal,
                failing: acct.failing,
                courses: []
            };
            var page = $(new DOMParser().parseFromString(gradebookReq.responseText, "text/html"));
            var box = page.find(".myBox")[0];
            if (!box) { // If there is an error or something and the box cannot be found

                // Apparently this is is an array
                var possibleErrorLocation = page.find("#pageContentWrap").children().eq(1);

                // And here begins callback hell
                if (possibleErrorLocation.length > 0) { // Check if there's an error message here
                    // If the possible location exists, take the first one and return the error
                    displayErrorPage("#mainPageErrMsgDiv", "Oh No!", possibleErrorLocation.text().trim(), "ErrorCircle", function () {
                        $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                            getAndParseAccount(idX, callbackX, true); // Never reset the page regardless of original parameter
                        });
                    });
                } else {
                    displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "An unexpected error has occurred. Please try again later", "ErrorCircle", function () {
                        $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                            getAndParseAccount(idX, callbackX, true); // Never reset the page regardless of original parameter
                        });
                    });
                }
                return;
            }
            var rows = box.firstElementChild.children;
            var i = 1;
            while (i < 100) { // Safety against infinite loop
                var list = page.find("#link" + i).find("#link" + i);
                var element = $(list[0]);
                if (list.length <= 0) {
                    break;
                    // Some dark magic to compensate for the ridiculous nesting going on :(
                } else if (element.parent().parent().parent().parent().parent().parent().parent().parent().parent().parent().parent().parent().parent().attr("id") != "nonCurrentClass") {

                    // The following code gets the latest grade (whether it be exam, grading period, etc.)
                    var courseRow = rows[i].children;
                    var courseGrade = -1;
                    var courseExtType, courseExtNum, courseExtFriendlyNum;
                    for (var index = courseRow.length - 2; index >= 1; index--) { // For each grading period (stops at 1 because first column is name of course
                        var col = $(courseRow[index]);
                        if (col.text().trim().length > 0 && $(courseRow[index - 1]).text().trim().length > 0) {
                            courseGrade = col.text().trim();
                            var label = $(rows[0].children[index]);
                            courseExtFriendlyNum = label.text().trim();
                            var id = label.attr("id");
                            var termLoc = /\d/.exec(id).index; // Location of extNum number
                            courseExtType = id.substr(0, termLoc);
                            courseExtNum = id.substr(termLoc, /\D/.exec(id.substr(termLoc)).index);
                            break;
                        }
                    }
                    // End get latest grade

                    var nameAndTeacher = element.children();
                    var teacherField = nameAndTeacher.eq(2).html();

                    dataOut.courses.push({ // This has got to be the worst fucking code I've every fucking written
                        name: nameAndTeacher.eq(0).text().trim(),
                        teacher: teacherField.substring(teacherField.indexOf(":") + 2, teacherField.indexOf("<br>")).trim(),
                        grade: courseGrade,
                        GBID: element.parent().parent().parent().parent().attr("onclick").split("\"")[1].trim(),
                        courseID: element.parent().parent().parent().parent().attr("onclick").split("\"")[3].trim(),
                        extType: courseExtType,
                        extNum: courseExtNum,
                        termName: courseExtType + " " + courseExtFriendlyNum
                    });
                }
                i++;
            }
            finishedRetrieving = true;
            if (finishedAnimation) {
                currentAcctData = dataOut;
                callback(dataOut);
                return;
            }
        }).fail(function (xhr) { // Failure of second request
            // Some more callback hell
            if (xhr.readyState === 0) { // readyState = 0 means no internet connection
                displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't establish a connection. Please check your internet connection and try again.", "ErrorTriangle", function () {
                    $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                        getAndParseAccount(id, callback, doNotResetPage);
                    });
                });
            } else {
                displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't retrieve your account information (HTTP " + xhr.status + "). Please try again later.", "ErrorTriangle", function () {
                    $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                        getAndParseAccount(id, callback, doNotResetPage);
                    });
                });
            }
        });
    }).fail(function (xhr) { // Failure of first request
        if (xhr.readyState === 0) { // readyState = 0 means no internet connection
            displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't establish a connection. Please check your internet connection and try again.", "ErrorTriangle", function () {
                $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                    getAndParseAccount(id, callback, doNotResetPage);
                });
            });
        } else {
            displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't send your credentials (HTTP " + xhr.status + "). Please try again later.", "ErrorTriangle", function () {
                $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                    getAndParseAccount(id, callback, doNotResetPage);
                });
            });
        }
    });
}

function loadAcct(data) {
    if (!data) {
        $(".fade").hide();
        displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't load this account. This might be caused by your internet connection.", "ErrorCircle", function () {
            $("#mainPageErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                loadAcct(currentAcctData);
            });
        });
        return;
    }

    var goalText = $("#goalText");
    goalText.text("Goal: " + (isNumber(data.goal) ? data.goal : "Not Set"));
    $("#goal").off("click.promptForGoal").one("click.promptForGoal", promptForGoal);

    var total = 0; // Total grade across all courses
    var totalGPA = 0; // Total GPA across all courses
    var count = 0; // Number of courses

    $("#mainLoading, #mainPageErrMsgDiv").fadeOut(FADE_TIME); // Note: If .fade is ready to fade in faster than #mainLoading fades out, #mainLoading is nuked

    var courseList = $("#list");
    courseList.empty(); //Empties the list so we can add stuff

    courseList.append('<ons-list-header id="hamburgerHeader">' + data.name + '</ons-list-header>');

    $.each(data.courses, function (key, val) { // Loads stuff in course list
        var courseItem;

        if (val.grade < 0) { // If no grades in a course
            // Make a courseItem, append it to the list, and attach a listener
            courseItem = $('<ons-list-item tappable modifier="chevron longdivider" class="course">' +
                '<ons-col class="courseCol">' + // Column
                '<div class="courseName">' + val.name + '</div>' + // Course name/period
                '<div class="courseGrade">There are no grades in this course</div>' + // No Grades Entered
                '<div class="courseTeacher">' + val.teacher + '</div>' + // Teacher name
                '</ons-col></ons-list-item>');

            courseItem.on("click.viewCourse", function () {
                alertMsg("There are currently no assignments in this course.");
            });
        } else {
            if (isNumber(val.grade)) { // If it's a number, add it to the average
                total += +val.grade; // We can safely cast to int now
                totalGPA += convertToGPA(+val.grade);
                count++;
            }

            courseItem = $('<ons-list-item tappable modifier="chevron longdivider" class="course">' +
                '<ons-col class="courseCol">' + // Column
                '<div class="courseName">' + val.name + '</div>' + // Course name/period
                '<div class="courseGrade">Grade: ' + val.grade + '</div>' + // Grade
                '<div class="courseTeacher">' + val.teacher + '</div>' + // Teacher name
                '</ons-col></ons-list-item>');

            courseItem.on("click.viewCourse", function () {
                getAndParseCourse(val, loadGrades);
            });
        }
        courseList.append(courseItem);
    });

    // Start showing the information on the circles
    if (count > 0) {
        $("#innerCircleContainer > .innerCircle.front").text(Math.round(total / count));
        $("#innerCircleContainer > .innerCircle.back").text((totalGPA / count).toFixed(3));
    } else {
        $("#innerCircleContainer > .innerCircle").text("No Data");
        $(".innerCircle").css("font-size", "5vh");
    }
    $("#innerCircleContainer").show();

    // Failing is represented as pure red, while Goal is pure green
    var goal = isNumber(data.goal) ? data.goal : 100;
    var failing = isNumber(data.failing) ? data.failing : 60;
    // First, compute the average. Ensure colorAverage is between failing and goal.
    var colorAverage = ensureRange(Math.round(total / count), failing, goal);
    // Then, stretch the numbers from failing-goal to 0-100 by subtracting failing (new scale: 0-(goal-failing)) and multiplying by 100 / goal-failing (new scale: 0-100
    $("#outerCircle").css("background", colorFromGrade((colorAverage - failing) * (100 / (goal - failing))));

    // Set up flipping (hide elements and such)
    $("#outerCircle").flip();
    $("#descriptionContainer").flip({trigger: "manual"});

    // Using click event as a workaround because the flip:changed event does not fire for some reason
    $("#outerCircle").on("click.flipDescription", function () {
        $("#descriptionContainer").flip("toggle");
    });

    // For some reason, we need to add this handler every time we load the account
    $("#GPAInfo").on("click.loadHelpInfo", function () {
        alertMsg("This is a standardized GPA calculation used by most colleges. It does not take into account the weight of your courses, and ranges from 0 to 4 points.", "Standardized Unweighted GPA");
    });

    // Before fading in .fade, #mainLoading and #mainPageErrMsgDiv has to go. No matter what.
    $("#mainLoading, #mainPageErrMsgDiv").hide();
    //noinspection MagicNumberJS (Longer than normal because it displays the screen)
    $(".fade").fadeIn(1000);
}

// function loadGrades() moved to course.js
