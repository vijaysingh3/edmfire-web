// Firebase Storage helper functions

// image upload karna Firebase Storage me
function uploadImage(uid, file) {
  try {
    // pehle compress karna
    return compressImageBeforeUpload(file).then(function(compressed) {
      var timestamp = Date.now();
      var fileName = timestamp + ".webp";
      var storagePath = "HelpCenterData/supportImages/" + uid + "/" + fileName;
      var storageRef = firebase.storage().ref(storagePath);

      // metadata set karna
      var metadata = {
        contentType: "image/webp"
      };

      // upload karna
      return storageRef.put(compressed, metadata).then(function() {
        // download URL nikalna - storageRef se directly
        return storageRef.getDownloadURL();
      }).then(function(downloadURL) {
        console.log("Image uploaded successfully:", downloadURL);
        return downloadURL;
      });
    });
  } catch (error) {
    console.error("Upload image error:", error);
    return null;
  }
}

// image compress karna upload se pehle
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

        // size adjust karna
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;

        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // webp me convert karna
        canvas.toBlob(function(blob) {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Image compression failed"));
          }
        }, "image/webp", quality);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}