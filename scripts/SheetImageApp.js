"use strict";
import { log } from "./debug-mode.js";
import { HelperFunctions } from "./classes/HelperFunctions.js";
import { sheetImageActions, sheetControls } from "./SheetImageActions.js";
import { SheetImageDataController } from "./SheetImageDataController.js";
export class SheetImageApp {
    static displayMethods = [
        {
            name: "window",
            icon: "fas fa-external-link-alt",
            tooltip: "display image in pop-out window",
        },
        {
            name: "journalEntry",
            icon: "fas fa-book-open",
            tooltip: "display image in a dedicated journal entry",
        },
        {
            name: "artScene",
            icon: "far fa-image",
            tooltip: "display image in dedicated scene",
        },
        {
            name: "anyScene",
            icon: "fas fa-vector-square",
            tooltip: "display image in any scene with a frame tile and display tile",
        },
    ];

    /**
     *
     * @param {*} app - the application (sheet) that this is being called from
     * @param {*} html
     */
    static async applyImageClasses(app, html) {
        if (game.user.isGM) {
            let whichSheets = await game.JTCS.utils.getSettingValue(
                "artGallerySettings",
                "sheetSettings.modularChoices"
            );
            let documentName = app.document.documentName;
            documentName = documentName.charAt(0).toLowerCase() + documentName.slice(1);
            let selectorString = "img, video, .lightbox-image";
            if (whichSheets[documentName]) {
                console.log("Show controls in, " + documentName + " sheets");
                if (documentName === "journalEntry") {
                    html.find(selectorString).addClass("clickableImage");
                } else {
                    //for journal sheets, we want to right-click
                    html.find(selectorString).addClass("rightClickableImage");
                }
                //inject the controls into every image that has the clickableImage or rightClickableImage classes
                Array.from(html[0].querySelectorAll(".clickableImage, .rightClickableImage")).forEach((img) =>
                    SheetImageApp.injectImageControls(img, app)
                );
                //inject controls onto the sheet itself too
                SheetImageApp.injectSheetWideControls(app);
            } else {
                console.log(" controls in, " + documentName + " sheets toggled OFF :(");
            }
        }
    }

    static async setJournalFadeOpacity(journalSheet) {
        let opacityValue = game.JTCS.utils.getSettingValue("journalFadeOpacity");
        journalSheet.element[0].style.setProperty("--journal-fade", opacityValue + "%");
    }

    /**
     *  When the journal sheet renders, we're going to add controls over each image
     * @param {HTMLElement} imgElement - the image HTML element
     * @param {*} journalSheet - the journal sheet we're searching within
     */
    static async injectImageControls(imgElement, journalSheet) {
        await SheetImageApp.setJournalFadeOpacity(journalSheet);

        let template = "modules/journal-to-canvas-slideshow/templates/image-controls.hbs";

        let imageName = await SheetImageDataController.convertImageSourceToID(imgElement);
        imgElement.dataset.name = imageName;

        let displayTiles = await game.JTCS.tileUtils.getSceneSlideshowTiles("art", true);
        displayTiles = displayTiles.map((tile) => {
            return {
                tile: tile,
                randomID: foundry.utils.randomID(),
            };
        });

        let users = game.users.contents;

        let renderHtml = await renderTemplate(template, {
            currentSceneName: game.scenes.viewed.name,
            displayMethods: SheetImageApp.displayMethods,
            displayTiles: displayTiles,
            imgPath: imageName,
            users: users,
            // ...imageFlagData,
        });

        //wrap each image in a clickableImageContainer
        $(imgElement).wrap("<div class='clickableImageContainer'></div>");

        $(imgElement).parent().append(renderHtml);
        await SheetImageApp.activateImageEventListeners({
            controlsContainer: $(imgElement).parent(),
            journalSheet: journalSheet,
            imgElement: imgElement,
        });
    }
    static async injectSheetWideControls(journalSheet) {
        let template = game.JTCS.templates["sheet-wide-controls"];
        let renderHtml = await renderTemplate(template, {
            controls: sheetControls,
        });
        let $editorElement = $(journalSheet.element[0].querySelector(".window-content form"));
        $editorElement.prepend(renderHtml);
        let controlsContainer = $("#sheet-controls");
        await SheetImageApp.activateSheetWideEventListeners({ controlsContainer, journalSheet });
    }

    static async activateSheetWideEventListeners(options) {
        let { controlsContainer, journalSheet } = options;
        console.log("Conainer is", controlsContainer);
        $(controlsContainer)
            .off("click", "[data-action]")
            .on(
                "click",
                "[data-action]",
                async (event) => await SheetImageApp.handleAction(event, journalSheet, "action", false)
            );
    }

    // handle any interaction event
    static async handleAction(event, journalSheet, actionType = "action", isItem = true) {
        event.preventDefault();
        let targetElement = $(event.currentTarget);
        let imgElement;

        //"isItem" stands for if it's a sheet-wide control or an item-specific control
        if (isItem) {
            //if our target element is not an image, get the closest image from our clickableImageContainer parent
            //else just get the current target itself
            if (targetElement.prop("nodeName") !== "IMG") {
                imgElement = targetElement[0].closest(".clickableImageContainer").querySelector("img");
            } else {
                imgElement = targetElement[0];
            }
            //if our target element is a label, get the input before it instead
            targetElement.prop("nodeName") === "LABEL" && (targetElement = targetElement.prev());
        }

        let action = targetElement.data()[actionType];
        let handlerPropertyString = "onClick";

        switch (actionType) {
            case "hoverAction":
                handlerPropertyString = "onHover";
                break;
            case "changeAction":
                handlerPropertyString = "onChange";
                break;
        }
        let actionData = getProperty(sheetImageActions, action);
        if (actionType == "action") {
            console.table({ actionType, actionData });
        }

        if (actionData && actionData.hasOwnProperty(handlerPropertyString)) {
            //call the event handler stored on this object
            let options = {
                action: action,
                app: journalSheet,
                html: journalSheet.element,
                ...(imgElement && { parentItem: imgElement.closest(".clickableImageContainer") }),
                imgElement: imgElement,
            };
            actionData[handlerPropertyString](event, options);
        }
    }

    /**
     *
     * @param data - the data object
     */
    static async activateImageEventListeners(data) {
        let { journalSheet, imgElement, controlsContainer } = data;
        let html = journalSheet.element;
        //add data actions to the images
        $(imgElement).attr("data-hover-action", "image.hover.showTileIndicator");
        $(imgElement).attr("data-action", "image.click.sendImageDataToDisplay");

        $(controlsContainer)
            .off("click", ".clickableImageControls [data-action]")
            .on(
                "click",
                ".clickableImageControls [data-action]",
                async (event) => await SheetImageApp.handleAction(event, journalSheet, "action")
            );
        $(controlsContainer)
            .off("mouseenter mouseleave", "[data-hover-action]")
            .on(
                "mouseenter mouseleave",
                "[data-hover-action]",
                async (event) => await SheetImageApp.handleAction(event, journalSheet, "hoverAction")
            );
        $(controlsContainer)
            .off("change", "[data-change-action]")
            .on(
                "change",
                "[data-change-action]",
                async (event) => await SheetImageApp.handleAction(event, journalSheet, "changeAction")
            );
    }

    static async addFadeStylesToSheet(event) {
        event.preventDefault();
        let windowContent = event.currentTarget.closest(".window-content");
        let fadeButtons = windowContent.querySelectorAll(`[data-action="fadeJournal"]`, `[data-action="fadeContent"]`);
        let action = event.currentTarget.dataset.action;
        // let className = location === "fadeContent" ? "fadeAll" : "fade";
        let classNames = ["fade"];
        if (action === "fadeContent") {
            classNames.push("fade-all");
        }

        if (windowContent.classList.contains("fade")) {
            windowContent.classList.remove("fade", "fade-all");
            fadeButtons.forEach((btn) => btn.classList.remove("active"));
        } else {
            windowContent.classList.add(...classNames);
            fadeButtons.forEach((btn) => btn.classList.add("active"));
        }
        return;
    }
}