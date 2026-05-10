// Firebase Storage helper functions

// image upload karna Firebase Storage me
async function uploadImage(uid, file) {
  try {
    // pehle compress karna
    const compressed = await compressImageBeforeUpload(file);

    const timestamp = Date.now();
    const fileName = timestamp + ".webp";
    const storagePath = "HelpCenterData/supportImages/" + uid + "/" + fileName;
    const storageRef = firebase.storage().ref(storagePath);

    // metadata set karna - content type zaroori hai
    const metadata = {
      contentType: "image/webp",
      customMetadata: {
        uploadedBy: uid
      }
    };

    // upload karna
    const uploadTask = await storageRef.put(compressed, metadata);

    // download URL nikalna - naya method
    const downloadURL = await storageRef.getDownloadURL();

    console.log("Image uploaded successfully:", downloadURL);
    return downloadURL;
  } catch (error) {
    console.error("Upload image error:", error);
    return null;
  }
}

// image compress karna upload se pehle
function compressImageBeforeUpload(file) {
  return new Promise((resolve, reject) => {
    const maxWidth = 800;
    const maxHeight = 800;
    const quality = 0.7;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

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

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // webp me convert karna
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Image compression failed"));
            }
          },
          "image/webp",
          quality
        );
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}