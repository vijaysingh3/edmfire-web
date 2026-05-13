// Firebase Storage helper functions

function uploadImage(uid, file) {
  try {
    return compressImageBeforeUpload(file).then(function(compressed) {
      var timestamp = Date.now();
      var fileName = timestamp + ".webp";
      var storagePath = "HelpCenterData/supportImages/" + uid + "/" + fileName;
      var storageRef = firebase.storage().ref(storagePath);
      var metadata = { contentType: "image/webp" };

      return storageRef.put(compressed, metadata).then(function() {
        return storageRef.getDownloadURL();
      }).then(function(downloadURL) {
        console.log("Image uploaded:", downloadURL);
        return downloadURL;
      });
    });
  } catch (error) {
    console.error("Upload image error:", error);
    return null;
  }
}

function compressImageBeforeUpload(file) {
  return new Promise(function(resolve, reject) {
    var maxWidth = 800;
    var maxHeight = 800;
    var quality = 0.7;

    var reader = new FileReader();
    reader.onload = function(event) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement("canvas");
        var width = img.width;
        var height = img.height;

        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }

        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        canvas.toBlob(function(blob) {
          if (blob) { resolve(blob); } else { reject(new Error("Compression failed")); }
        }, "image/webp", quality);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}