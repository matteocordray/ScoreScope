var accountMetadata;
var settings;
var ss; // Secure storage plugin
var currentDWD, currentWFAACL, currentStudentID, currentAcctURL; //workaround; we should get rid of this eventually
var currentAcctData;

const timeout = 30000; // Default timeout in milliseconds
const transitionTime = 0.3; // Time to reset page in seconds
const fadeTime = 100; // Time to fade in main page in milliseconds
const errFadeTime = 150; // Time to fade in/out the error messages in milliseconds
const iOSBtnFadeTime = 100; // Time to fade iOS back button in milliseconds

// The Main Thing
ons.forcePlatformStyling("ios"); // Force iOS design, even on non-iOS platforms
$(document).ready(function () {
    ons.ready(function () {
        // Nasty and unrecommended hack to set a timeout.
        // TODO: fix this shit
        $.ajaxSetup({
            timeout: timeout
        });

        $("#iOSBackBtn").on("click.goBack", goBack);
        $("#settingsBtn").one("click", function () {
            $.getScript("settings/settings.js", function () {
                $("#settingsBtn").click(goToSettings);
                goToSettings();
            });
        });

        $("#acctBtn").click(openAcctPopover);

        //Initialize SecureStorage plugin and get metadata
        ss = new cordova.plugins.SecureStorage(
            function () { // If success
                console.info("Secure storage init complete!");
                ss.get(function (metadata) { // If success
                    accountMetadata = JSON.parse(metadata).accounts;
                    console.info("Successfully retrieved metadata!");

                    loadAcctList();

                    document.addEventListener("resume", onResume, false);
                }, function (error) { // If there's an error, fuck it and make user log in again
                    console.error(error);
                    console.warn("Assuming first run! Redirecting...");
                    window.location.replace("accounts/firstRun.html");
                }, "accountMetadata");
            },
            function (error) {
                console.error("Error: " + error);
                displayErrorPage("mainPageErrMsgDiv", "Oh No!", "Failed to initialize secure storage. Please try again later.", "ErrorTriangle", null);
            },
            "scorescope" // Key for storage.
        );
    });
});

/* Various listeners and stuff go here */
function goBack() {
    if (typeof settingsNavi !== "undefined" && settingsNavi.topPage.name !== "mainSettings") {
        settingsNavi.popPage({
            animation: "slide",
            animationOptions: {duration: transitionTime}
        });
        $("#title").text("Settings");
        return;
    }

    switch (navi.pages[navi.pages.length - 2].name.toLowerCase()) {
        case "mainpage":
            $('#iOSBackBtn').fadeOut(iOSBtnFadeTime); // iOS only back button handler
            $(".right").fadeIn(fadeTime);
            $("#title").text("Gradebook");
            break;
        case "accounts/accountManager.html":
            $("#title").text("Accounts");
            break;
        case "settings/settings.html":
            $("#title").text("Settings");
            break;
        default:
            console.warn("Received incorrect navi topPage name!");
            break;
    }
    navi.popPage({
        animation: "slide",
        animationOptions: {duration: transitionTime} // Longer because stuff needs to load
    });
}

function onRefreshClick() { // Unused right now
    onResume();
}

function onResume() { // Treat resuming like a fresh open
    $("#title").text("Gradebook");

    $("#saveBtn").hide();
    var backBtn = $("#iOSBackBtn");
    backBtn.off("click.editorGoBack");
    backBtn.on("click.goBack", goBack);
    backBtn.hide();

    navi.resetToPage("mainPage", {
        animation: "lift",
        animationOptions: {duration: transitionTime}
    }).then(function () {
        loadAcctList();
    });
}

function goToSettings() {
    $("#iOSBackBtn").fadeIn(iOSBtnFadeTime); // iOS only: fade in back button (and don't close the menu because there is none)

    if (navi.topPage.name == "settings/settings.html") {
        if (settingsNavi.topPage.name !== "mainSettings") {
            // If navi is at settings but settingsNavi is in a subpage, then pop to settings and update the title
            settingsNavi.popPage().then(function () {
                $("#title").text("Settings");
            });
        } else { // If already on settings page, flash
            $(settingsNavi).fadeOut(fadeTime);
            $(settingsNavi).fadeIn(fadeTime);
        }
        return;
    }

    navi.resetToPage("settings/settings.html", {
        animation: "slide",
        animationOptions: {duration: transitionTime}
    }).then(function () { // Must use .then() because settings dom is not loaded until animation completes
        navi.insertPage(0, "mainPage").then(function () {
            loadAcct(currentAcctData); // Ensure that user can always back out
        });
    });
    $("#title").text("Settings");
}

function openAcctPopover() { // iOS only popover button handler
    pop.show('#acctBtn');
}

function goToAcctMgr() {
    $("#iOSBackBtn").fadeIn(iOSBtnFadeTime); // iOS only: fade in back button, hide popover, and don't close the menu because there is none
    pop.hide();

    if (navi.topPage.name == "accounts/accountManager.html") {
        loadAccountManager();
        pop.hide();
        return;
    }

    navi.resetToPage("accounts/accountManager.html", {
        animation: "slide",
        animationOptions: {duration: transitionTime}
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

function displayErrorPage(selector, errorTitle, errorContent, errorIconType, retryCallback) {
    $(selector + " > .errorTitle").text(errorTitle);
    $(selector + " > .errorDetails").text(errorContent);

    var erb = $(selector + " > .errorRetryBtn");
    erb.hide();
    if (typeof retryCallback === "function") {
        erb.show();
        erb.unbind("click").on("click", retryCallback); // Prevent multiple retryCallbacks being added
    }

    if (errorIconType) {
        $(selector + " > .errorIcon").attr("src", "lib/img/" + errorIconType + ".svg");
    }

    // Use when selector so that callback gets called once even if there are multiple loadingCircles
    $.when($(".loadingCircle").fadeOut(errFadeTime)).then(function () {
        $(selector + ".errorMsgDiv").fadeIn(errFadeTime);
    });
}

function isNumber(number) {
    return !isNaN(parseFloat(number)) && isFinite(number);
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
    //noinspection LocalVariableNamingConventionJS
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
        menuList.append('<ons-list-item tappable modifier="ripple longdivider" onclick="getAndParseAccount(' + key + ',loadAcct)">' + val.name + '</ons-list-item>');
    });

    /* iOS only: Add the add accounts button */
    $("#menuList").append('<ons-list-item tappable id="acctMgr"><ons-icon icon="fa-user" size="18px"></ons-icon>&nbsp;&nbsp;Manage Accounts</ons-list-item>');
    $("#acctMgr").one("click", function () {
        $.getScript("accounts/accountManager.js", function () {
            $("#acctMgr").click(goToAcctMgr);
            goToAcctMgr();
        });
    });
    /* End iOS only */

    getAndParseAccount(optionalAcctToLoad ? optionalAcctToLoad : 0, loadAcct, true); // Loads the specified account in data without creating a new page. If none provided, loads first acct.
}

function getAndParseAccount(id, callback, doNotResetPage) {
    $("#mainPageErrMsgDiv").fadeOut(errFadeTime);

    var resetPage = !doNotResetPage;

    // Workarounds because dom loading is after animations, but retrieval of data may take longer than animation
    var finishedRetrieving = false;
    var finishedAnimation = false;

    currentAcctData = null;
    var dataOut;

    /* iOS only: hide popover and back button, then pop page (this is ok since on iOS the account switcher is only shown
     *  on the grades and courses pages) */
    pop.hide();
    if (navi.pages.length >= 2 && navi.pages[navi.pages.length - 2].name === "mainPage") { // If going back to mainpage, remove back button
        $("#iOSBackBtn").fadeOut(iOSBtnFadeTime);
        $("#title").text("Gradebook"); // Change title text
    }
    $(".fade").hide(); // Hide stuff that needs to fade in
    if (navi.topPage.name !== "mainPage" && resetPage) { // If currently on course view, pop!
        navi.popPage({
            animation: "slide",
            animationOptions: {duration: transitionTime}
        }).then(function () {
            finishedAnimation = true;
            if (finishedRetrieving) { // If the app has retrieved the data before the page resets, load data after reset
                currentAcctData = dataOut;
                callback(dataOut);
                return;
            }
        });
    } else {
        finishedAnimation = true;
        $(".fade").hide(); // Hide stuff that needs to fade in
    }
    /* End iOS only code */

    $("#mainLoading").fadeIn(fadeTime);

    var acct = accountMetadata[id];

    // skyportReq sends username, password, and some constants, retrieves DWD, WFAACL, and studentID
    var skyportReq = $.post(acct.url + "skyporthttp.w", {
        requestAction: "eel",
        codeType: "tryLogin",
        login: acct.login,
        password: acct.password
    }).done(function () {
        // Detect is credentials are invalid. Good credentials will cause the response to contain the username
        if (skyportReq.responseText.toLowerCase().indexOf("invalid login or password") > -1 || skyportReq.responseText.toLowerCase().indexOf(acct.login) == -1) {
            // TODO: properly handle this
            displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't authenticate with the server. Please verify your credentials and try again.", "ErrorCircle", function () {
                $("#mainPageErrMsgDiv").fadeOut(errFadeTime, function () {
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
                courses: []
            };
            // The following line doesn't work for some reason on MS Edge. TODO: Find a workaround for MS Edge
            var page = $(new DOMParser().parseFromString(gradebookReq.responseText, "text/html"));
            var box = page.find(".myBox")[0];
            if (!box) { // If there is an error or something and the box cannot be found

                // Apparently this is is an array
                var possibleErrorLocation = page.find("#pageContentWrap").children().eq(1);

                // And here begins callback hell
                if (possibleErrorLocation.length > 0) { // Check if there's an error message here
                    // If the possible location exists, take the first one and return the error
                    displayErrorPage("#mainPageErrMsgDiv", "Oh No!", possibleErrorLocation.text().trim(), "ErrorCircle", function () {
                        $("#mainPageErrMsgDiv").fadeOut(errFadeTime, function () {
                            getAndParseAccount(idX, callbackX, true); // Never reset the page regardless of original parameter
                        });
                    });
                } else {
                    displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "An unexpected error has occurred. Please try again later", "ErrorCircle", function () {
                        $("#mainPageErrMsgDiv").fadeOut(errFadeTime, function () {
                            getAndParseAccount(idX, callbackX, true); // Never reset the page regardless of original parameter
                        });
                    });
                }
                return;
            }
            var rows = box.firstChild.children;
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
                    var courseExtType, courseExtNum;
                    for (var index = courseRow.length - 2; index >= 1; index--) { // For each grading period (stops at 1 because first column is name of course
                        var col = $(courseRow[index]);
                        if (col.text().trim().length > 0 && $(courseRow[index - 1]).text().trim().length > 0) {
                            courseGrade = col.text().trim();
                            var id = $(rows[0].children[index]).attr("id");
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
                        CourseID: element.parent().parent().parent().parent().attr("onclick").split("\"")[3].trim(),
                        extType: courseExtType,
                        extNum: courseExtNum
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
            if (xhr.readyState == 0) { // readyState = 0 means no internet connection
                displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't establish a connection. Please check your internet connection and try again.", "ErrorTriangle", function () {
                    $("#mainPageErrMsgDiv").fadeOut(errFadeTime, function () {
                        getAndParseAccount(id, callback, doNotResetPage);
                    });
                });
            } else {
                displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't retrieve your account information (HTTP " + xhr.status + "). Please try again later.", "ErrorTriangle", function () {
                    $("#mainPageErrMsgDiv").fadeOut(errFadeTime, function () {
                        getAndParseAccount(id, callback, doNotResetPage);
                    });
                });
            }
        });
    }).fail(function (xhr) { // Failure of first request
        if (xhr.readyState == 0) { // readyState = 0 means no internet connection
            displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't establish a connection. Please check your internet connection and try again.", "ErrorTriangle", function () {
                $("#mainPageErrMsgDiv").fadeOut(errFadeTime, function () {
                    getAndParseAccount(id, callback, doNotResetPage);
                });
            });
        } else {
            displayErrorPage("#mainPageErrMsgDiv", "Oh No!", "We couldn't send your credentials (HTTP " + xhr.status + "). Please try again later.", "ErrorTriangle", function () {
                $("#mainPageErrMsgDiv").fadeOut(errFadeTime, function () {
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
            $("#mainPageErrMsgDiv").fadeOut(errFadeTime, function () {
                loadAcct(currentAcctData);
            });
        });
        return;
    }

    var total = 0; // Total grade across all courses
    var count = 0; // Number of courses

    $("#mainLoading, #mainPageErrMsgDiv").fadeOut(fadeTime);

    var courseList = $("#list");
    courseList.empty(); //Empties the list so we can add stuff

    courseList.append('<ons-list-header id="hamburgerHeader" modifier="material">' + data.name + '</ons-list-header>');

    $.each(data.courses, function (key, val) { // Loads stuff in course list
        if (val.grade < 0) { // If no grades in a course
            $("#list").append('<ons-list-item tappable modifier="chevron longdivider" class="course systemFont" onclick="alertMsg(\'There are currently no assignments in this course\')">' +
                '<ons-col class="courseCol">' + // Column
                '<div class="courseName">' + val.name + '</div>' + // Course name/period
                '<div class="courseGrade">There are no grades in this course</div>' + // No Grades Entered
                '<div class="courseTeacher">' + val.teacher + '</div>' + // Teacher name
                '</ons-col></ons-list-item>');
        } else {
            if (isNumber(val.grade)) { // If it's a number, add it to the average
                total += +val.grade; // We can safely cast to int now
                count++;
            }

            $("#list").append('<ons-list-item tappable modifier="chevron longdivider" class="course systemFont" ' +
                'onclick="getAndParseCourse(' + val.GBID + ',' + val.CourseID + ',&apos;' + val.extType + '&apos;,' + val.extNum + ',&apos;' + val.name + '&apos;,&apos;' + val.teacher + '&apos;,' + '&apos;' + val.grade + '&apos;, loadGrades)">' +
                '<ons-col class="courseCol">' + // Column
                '<div class="courseName">' + val.name + '</div>' + // Course name/period
                '<div class="courseGrade">Grade: ' + val.grade + '</div>' + // Grade
                '<div class="courseTeacher">' + val.teacher + '</div>' + // Teacher name
                '</ons-col></ons-list-item>');
        }
    });

    var outerCircle = $("#outerCircle");
    var outerDia = ($(window).height() * 0.35); // Height of avgCircleArea is always 40% of window height. 0.35 compensates for text
    outerCircle.css("height", outerDia);
    outerCircle.css("width", outerDia);
    outerCircle.css("border-radius", outerDia / 2);

    // 60 is represented as pure red. 2.5 comes from 100 / (average - 60)
    outerCircle.css("background", colorFromGrade((Math.round(total / count) - 60) * 2.5));

    var innerCircle = $("#innerCircle");
    innerCircle.empty();

    var innerDia = outerDia * 0.6;
    innerCircle.css("height", innerDia);
    innerCircle.css("width", innerDia);
    innerCircle.css("border-radius", innerDia / 2);
    innerCircle.css("margin", (outerDia - innerDia) / 2 + "px");

    var fontSize = innerDia / 1.75;

    if (count > 0) {
        innerCircle.append('<div id="circleText">' + Math.round(total / count) + '</div>');
        $("#circleText").css("margin-top", (outerDia / 4) - (fontSize / 2.25)); // Divide by 2.25 to correct for actual font size being different
    } else {
        innerCircle.append('<div id="circleText">No Data</div>');
        fontSize = innerDia / 3;
        $("#circleText").css("margin-top", "10px");
    }

    innerCircle.css("font-size", fontSize + "px");

    $("#avgText").text("Average across all courses");

    $(".fade").fadeIn(1000); // Longer than normal because it displays the screen
}

// function loadGrades() moved to course.js