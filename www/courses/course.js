var basePIColors = ["#BA302D", "#039BE5", "#7CB342", "#AFBF1F", "#5E35B1", "#1AAB8B"];

function getAndParseCourse(data, callback, doNotPushPage) {

    // Hack to make course error retry button works. Provide any value for doNotPushPage and the page will not pop.
    if (typeof doNotPushPage === "undefined") {
        navi.pushPage("courses/course.html", {
            animation: "slide",
            animationOptions: {duration: TRANSITION_TIME}
        });
    }

    var assnReq = $.post(currentAcctURL + "gradebook003.w", {
        dwd: currentDWD,
        wfaacl: currentWFAACL,
        currentStudent: currentStudentID,
        currentExtType: data.extType,
        currentExtNum: data.extNum,
        currentGBId: data.GBID,
        currentCourseId: data.courseID,
        LinkData: "studentaccess.w"
    }).done(function () {
        var page = $(new DOMParser().parseFromString(assnReq.responseText, "text/html"));

        // Initialize courses
        var course = data;
        course.categories = [];

        var categories = page.find(".categories");

        if (categories.length > 0) {
            var element = $(categories[0]);
        } else {
            $("#assignmentList").empty();

            displayErrorPage("#courseErrMsgDiv", "Oh No!", "The server sent a malformed response.", "ErrorCircle", function () {
                $("#loading").fadeIn(FADE_TIME);

                $("#courseErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                    getAndParseCourse(data, callback, true);
                });
            });
            return;
        }

        // Index of current category in the categories array of course.
        // Starts at -1 because it is incremented at the beginning of every category, so the first one will start at 0
        var currentCategoryIndex = -1;

        var categoryTemplate = { // Template for a category
            name: null,
            weight: null,
            average: null,
            items: []
        };

        while (element.next().length > 0) { // While there's still more elements below
            var currentCategory;

            if (element.attr("class").indexOf("categories") > -1) { // If the current element is a category
                currentCategoryIndex++;

                // Push empty template onto categories list
                // Must deep copy b/c js is pass-by-value for arrays
                course.categories.push($.extend(true, {}, categoryTemplate));
                currentCategory = course.categories[currentCategoryIndex];

                currentCategory.name = $(element[0].firstChild.firstChild).text().trim();

                var weightText = $(element[0].firstChild).children().text().trim();
                currentCategory.weight = Math.round(+weightText.substr(weightText.indexOf("(") + 1, weightText.indexOf("%") - 1));

                // TODO once skyward is up: fix this using CSS
                currentCategory.average = element.children().eq(2).text().trim().length > 0 ? +element.children().eq(2).text().trim() : "&nbsp;&nbsp;";
                currentCategory.items = [];
            } else { // Must be item
                //noinspection JSUnusedAssignment
                currentCategory.items.push({
                    date: element.children().eq(0).text().trim(), // Date assignment entered
                    name: element.children().eq(1).text().trim(),
                    modifier: element.children().eq(2).text().trim(), // The modifier is like no count, incomplete, etc.
                    grade: element.children().eq(3).text().trim()
                });
            }
            element = element.next();
        }
        callback(course);
    }).fail(function (xhr) { // Failure of request for assignments
        if (xhr.readyState === 0) { // This means no internet (or timed out)
            displayErrorPage("#courseErrMsgDiv", "Oh No!", "We couldn't establish a connection. Please check your internet connection and try again.", "ErrorTriangle", function () {
                $("#loading").fadeIn(FADE_TIME);

                $("#courseErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                    getAndParseCourse(data, callback, true);
                });
            });
        } else {
            displayErrorPage("#courseErrMsgDiv", "Oh No!", "We couldn't retrieve assignment data (HTTP " + xhr.status + "). Please check your internet connection and try again.", "ErrorTriangle", function () {
                $("#loading").fadeIn(FADE_TIME);

                $("#courseErrMsgDiv").fadeOut(ERR_FADE_TIME, function () {
                    getAndParseCourse(data, callback, true);
                });
            });
        }
    });
}
function loadGrades(course) {
    var categories = course.categories;

    var loading = $("#loading");
    var asmtList = $("#assignmentList");
    asmtList.empty();
    asmtList.show(); // To prevent empty piChart

    var piLeg;
    var piChart;

    var unscaledPIData = [];
    var scaledPIData = [];
    var scale = 1.0; // Scale to account for empty categories
    var piColors = [];

    loading.fadeOut(FADE_TIME * 2, function () { // Get rid of loading screen. Extra long fade time.
        //loading.remove(); May be needed?

        // The following lines appends the course and instructor names. Asmt stands for assignment
        if (cordova.platformId === "ios") {
            asmtList.append('<div class="asmtHeader">' + '<div id="asmtHeaderLeft">' +
                '<div id="asmtCourseName">' + course.name + '</div>' +
                '<div id="asmtCourseTeacher">' + course.teacher + '</div>' + /*end asmtHeaderLeft*/'</div>' +
                '<select id="GPSelector" class="iOS">' + '<option selected extType="' + course.extType + '" extTerm="' + course.extNum + '" termName="' + course.termName + '" value="0">' + course.termName + '</option>' +
                '</select>' + /*end asmtHeader*/'</div>'
            );
        } else {
            asmtList.append('<div class="asmtHeader">' + '<div id="asmtHeaderLeft">' +
                '<div id="asmtCourseName">' + course.name + '</div>' +
                '<div id="asmtCourseTeacher">' + course.teacher + '</div>' + /*end asmtHeaderLeft*/'</div>' +
                '<select id="GPSelector">' + '<option selected extType="' + course.extType + '" extTerm="' + course.extNum + '" termName="' + course.termName + '" value="0">' + course.termName + '</option>' +
                '</select>' + /*end asmtHeader*/'</div>'
            );
        }

        $("#GPSelector").on("change", function () {
            selectGradingPeriod(course);
        });

        asmtList.append('<div id="piDiv"><ons-row><ons-col width="' + $(window).width() * 0.55 + 'px" vertical-align="center">' +
            '<canvas id="piChart" height="' + $(window).width() * 0.55 + 'px" width="' + $(window).width() * 0.55 + '"></canvas></ons-col>' +
            '<ons-col vertical-align="center"><div id="piLegend"></div></ons-col></ons-row></div>'
        ); // Appends canvas to draw pi chart

        piLeg = $("#piLegend");
        piChart = $("#piChart");

        $.each(categories, function (catIndex, cat) { // Add categories
            asmtList.append('<ons-row class="threeCols">' +
                '<ons-col class="catColWeight">' + cat.name + ' (' + cat.weight + '%)' + '</ons-col>' +
                (isNumber(cat.average) ? ('<ons-col class="catColAvg" width="100px">Average: ' + cat.average + '</ons-col>') : '') +
                '</ons-row>');

            // Appends Legend
            asmtList.append('<ons-row id="legend">' +
                '<ons-col class="alignL" width="85px">Date</ons-col>' +
                '<ons-col class="alignL">Assignment</ons-col>' +
                '<ons-col class="alignR" width="35px">Score</ons-col></ons-row>' +
                '<div id="legendDiv"></div>');

            if (isNumber(categories[catIndex].average)) { // If the category has a numerical average let's assume there's assignments
                $.each(categories[catIndex].items, function (index, assignment) { // Add assignments
                    asmtList.append('<ons-row class="assignment">' +
                        '<ons-col class="alignL" width="85px">' + assignment.date + '</ons-col>' +
                        '<ons-col class="alignL">' + assignment.name + '</ons-col>' +
                        (isNumber(assignment.grade) ? // If the grade is a number, print that. Otherwise, print the modifier
                            ('<ons-col class="alignR" width="30px">' + assignment.grade + '</ons-col></ons-row>')
                            : ('<ons-col class="alignR" width="85px">' + assignment.modifier + '</ons-col></ons-row>')));
                });

                // Only include a category in the piChart if there are assignments in it.
                unscaledPIData.push(cat.average * cat.weight / 100);
                unscaledPIData.push(cat.weight * (100 - cat.average) / 100);
                piColors.push(getPIColor(catIndex));
                piColors.push(lightenColor(getPIColor(catIndex), 0.4));
            } else {
                asmtList.append('<ons-row class="assignment">No items exist in this category</ons-row>');
                scale -= cat.weight / 100;
            }

            // However, give each category a spot on the legend regardless
            piLeg.append('<ons-row class="piLegRow"><ons-col width="20px"><div id="piLegCol" style="background-color:' + getPIColor(catIndex) + ';">' +
                '</div></ons-col><ons-col class="piLegColText">' + cat.name + '</ons-col></ons-row>');
        });

        // Now scale the piData and draw it
        $.each(unscaledPIData, function (key, val) {
            scaledPIData.push(val / scale);
        });
        drawPIChart(piChart, scaledPIData, piColors);

        loadGradingPeriods({
            GBID: course.GBID,
            courseID: course.courseID,
            termName: course.termName
        });

        asmtList.hide();
        asmtList.fadeIn(400); // Extra long fade time
    });
}

/* Some courseView specific helper methods */

// Code taken from some random StackOverflow post
function drawPIChart(canvas, data, colors) {
    var ctx = canvas[0].getContext("2d");
    var lastEnd = Math.PI * 3 / 2;
    $.each(data, function (index, dataPoint) {
        ctx.fillStyle = colors[index];
        ctx.beginPath();
        ctx.moveTo(canvas.width() / 2, canvas.height() / 2);
        // Arc Parameters: x, y, radius, startingAngle (radians), endingAngle (radians), antiClockwise (boolean)
        ctx.arc(canvas.width() / 2, canvas.height() / 2, canvas.height() / 2, lastEnd, lastEnd + (Math.PI * 2 * (dataPoint / 100)), false);
        ctx.lineTo(canvas.width() / 2, canvas.height() / 2);
        ctx.fill();
        lastEnd += Math.PI * 2 * (dataPoint / 100);
    });
}

function getPIColor(index) {
    // TODO: Maybe handle generating colors if there are way to many categories
    return basePIColors[index % basePIColors.length];
}

function loadGradingPeriods(data) {
    // Request a list of grading periods for this course
    var gpReq = $.post(currentAcctURL + "gradebook002.w", {
        dwd: currentDWD,
        wfaacl: currentWFAACL,
        currentStudent: currentStudentID,
        currentGBId: data.GBID,
        currentCourseId: data.courseID
    }).done(function () {
        var page = $(new DOMParser().parseFromString(gpReq.responseText, "text/html"));
        var box = page.find(".myBox")[0];

        if (!box) { // If no box, give up
            return;
        }

        // Empty list
        var selector = $("#GPSelector"); // The select box
        selector.empty();

        // Go through each grading period
        var index = 0;
        $.each(box.firstChild.children, function (key, val) {
            // Grading period's second innermost div
            var termDetails = val.firstChild.firstChild.firstChild.firstChild.firstChild; // td tag with termName 01
            var possibleGP = termDetails.firstChild.firstChild.firstChild.firstChild; // keep going till a span tag with name of gp

            // This will be either "no grades posted" or "grade: xxx"
            if (possibleGP.children[2].innerHTML.toLowerCase().indexOf("no grades posted") === -1) {
                var base = data.termName.substr(0, data.termName.lastIndexOf(" ")); // base is like "TERM", "YEAR", etc.
                var ending = possibleGP.children[0].innerHTML; // ending is like "1st", "2nd", etc.
                var termName = base + " " + ending;

                //Need to set data values, then do select grading period
                var termString = $(termDetails).attr("onclick").split("\"");
                var extType = termString[1];
                var extNum = termString[3];

                var option = $('<option extType="' + extType + '" extNum="' + extNum + '" termName="' + termName + '" value="' + index + '">' + termName + '</option>');
                selector.append(option);

                if (termName === data.termName) {
                    option.attr("selected", "");
                }

                index++;
            }
        });
    });
}

function selectGradingPeriod(course) {
    var selected = $("#GPSelector").children().eq($("#GPSelector")[0].value);
    var selectedExtType = selected.attr("extType");
    var selectedExtNum = selected.attr("extNum");
    var selectedTerm = selected.attr("termName");

    $("#assignmentList").fadeOut(FADE_TIME, function () {
        getAndParseCourse({
            GBID: course.GBID,
            courseID: course.courseID,
            extType: selectedExtType,
            extNum: selectedExtNum,
            termName: selectedTerm,
            grade: course.grade,
            name: course.name,
            teacher: course.teacher
        }, loadGrades, true);
    });
}
