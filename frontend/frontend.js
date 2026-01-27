// ----------------------- delay function
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ----------------------- no cache test
// let nods = document.getElementsByClassName("item-cover");
// for (var i = 0; i < nods.length; i++) {
//   nods[i].attributes["src"].value += "?a=" + Math.random();
// }

// ----------------------- elements
let contents_masonry;
let contents = document.querySelector("#contents");
let loadingOverlay = document.querySelector("#loading");
let imageView = document.getElementById("image-view");
let imageViewClose = document.getElementById("close-image-view");
let itemCover = document.querySelectorAll(".item-cover");

// ----------------------- masonry

async function initializeLayout() {
  //
  // add item cover image view act
  itemCover.forEach((e) => {
    e.addEventListener("click", function () {
      imageViewAct(this);
    });
  });

  if (imageViewClose !== null) {
    imageViewClose.addEventListener("click", imageViewCloseAct);
  }

  if (contents !== null) {
    imagesLoaded(contents, function (instance) {
      // console.log("all images are loaded");

      delay(1000).then(() => {
        // loadingOverlay.classList.add("fade-out");
        // loadingOverlay.classList.toggle("show");

        loadingOverlay.classList.remove("show");
      });

      contents_masonry = new Masonry(contents, {
        // options
        itemSelector: ".item",
        // columnWidth: 0,
        percentPosition: true,
        gutter: 20,
        // transitionDuration: "0.5s",
        //   stagger: 30,
        initLayout: true,
      });

      loadVideo();
    });
  }
}

initializeLayout();

// document.body.addEventListener("touchstart", () => {
//   let video = document.querySelectorAll("video.item-cover");
//   video.forEach((element) => {
//     e.play();
//   });
// });

// window.addEventListener("load", (event) => {
//   // contents_masonry.layout();
//   console.log(document.getElementsByTagName("video"));
// });

// ----------------------- lazy video

function loadVideo() {
  const imageThumbnails = document.querySelectorAll(".lazy-video");
  //
  //
  imageThumbnails.forEach((img) => {
    // Bikin elemen video buat video
    const video = makeVideoElement(
      "item-cover",
      img.width,
      img.dataset.video,
      img.alt,
      img.src
    );

    // Kalau sudah siap dimainkan, ganti <img> dengan <video>
    try {
      video.addEventListener("canplaythrough", () => {
        img.replaceWith(video);
        addPauseHoverVideo(video);

        // if (video.paused) {
        //   video.play();
        // }

        //
        //
      });
    } catch (e) {
      console.log(e);
    }

    video.addEventListener("click", function () {
      imageViewAct(this);
    });
  });
}

function addPauseHoverVideo(videoElement) {
  // const video = document.querySelectorAll("video.item-cover");
  // // console.log(video);
  // video.forEach((videoElement) => {
  // console.log(videoElement);
  // kalau dilepas play
  // videoElement.addEventListener("pointerdown", function () {
  //   this.pause();
  // });
  // // kalau disentuh pause
  // videoElement.addEventListener("pointerup", function () {
  //   this.pause();
  //   // console.log(this);
  // });
  // kalau disentuh pause
  // videoElement.addEventListener("pointerup", function () {
  //   this.play();
  //   // console.log(this);
  // });
  // });
}

// ----------------------- view full image

function imageViewAct(contentClicked) {
  // console.log(contentClicked);

  // remove previous elemets
  let itemFullscreenView = document.getElementsByClassName(
    "item-fullscreen-view"
  )[0];
  //
  if (itemFullscreenView) {
    // itemFullscreenView.classList.add("pendingVisibility"); // kasih CSS transition
    // itemFullscreenView.addEventListener("transitionend", () => {
    //   itemFullscreenView.remove();
    // });

    itemFullscreenView.remove();
  }

  //
  let altTextElement =
    imageView.children[0].children[imageView.children[0].children.length - 1];

  // pause video
  document.querySelectorAll("video.item-cover").forEach((v) => {
    // console.log(v);
    v.pause();
  });

  // check video or image
  // kalau udah dirender kontennya
  if (contentClicked.tagName === "VIDEO") {
    //
    const video = makeVideoElement(
      "item-fullscreen-view",
      null,
      contentClicked.children[0].src,
      contentClicked.dataset.alt,
      contentClicked.poster
    );

    //
    imageView.children[0].prepend(video);
    altTextElement.innerText = contentClicked.dataset.alt;
  } else if (contentClicked.tagName === "IMG") {
    //
    const video = makeImgElement(
      "item-fullscreen-view",
      contentClicked.width,
      contentClicked.src,
      contentClicked.alt
    );
    //
    imageView.children[0].prepend(video);
    altTextElement.innerText = contentClicked.alt;
  }

  // show container
  imageView.classList.add("show");
  document.body.style.overflow = "hidden";

  // console.log(contentClicked.tagName);
  // console.log(imageView.children[0]);
}

function imageViewCloseAct() {
  document.body.style.overflow = "scroll";
  imageView.classList.remove("show");
  //
  // let itemFullscreenView = document.getElementsByClassName(
  //   "item-fullscreen-view"
  // )[0];
  //

  // play video lagi
  document.querySelectorAll("video.item-cover").forEach((v) => {
    // console.log(v);
    v.play();
  });
}

function makeVideoElement(
  videoClassName,
  videoWidth,
  videoURL,
  videoAlt,
  videoPoster
) {
  const video = document.createElement("video");
  video.classList.add(videoClassName);
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.setAttribute("playsinline", true);
  video.setAttribute("webkit-playsinline", true);
  video.setAttribute("disablePictureInPicture", true);
  video.setAttribute("poster", videoPoster);

  if (videoWidth) {
    video.width = videoWidth;
  }

  if (videoAlt) {
    video.setAttribute("data-alt", videoAlt);
  } else {
    video.setAttribute("data-alt", videoURL);
  }

  const videoSource = document.createElement("source");
  videoSource.src = videoURL;

  video.appendChild(videoSource);

  // video.play();

  return video;
}

function makeImgElement(imgClassName, imgWidth, imgURL, imgAlt) {
  const img = document.createElement("img");
  img.classList.add(imgClassName);
  img.src = imgURL;
  img.alt = imgAlt;
  img.width = imgWidth;

  return img;
}

// ----------------------- temporary link
document.body.addEventListener("click", (element) => {
  let clickedElement = element.target;

  // console.log(clickedElement);

  if (
    // clickedElement.classList.contains("item-cover") ||
    clickedElement.classList.contains("see-more-links") ||
    clickedElement.parentElement.classList.contains("navigation-links") ||
    clickedElement.classList.contains("notice-back-link")
  ) {
    element.preventDefault();
    document.getElementById("notice").classList.toggle("show");
  }
});
