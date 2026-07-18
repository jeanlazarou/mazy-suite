import React, { useState, useCallback, useRef } from 'react';
import { Modal, Button, Group } from '@mantine/core';
import ReactCrop, { Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface ImageCropModalProps {
  isCropping: boolean;
  setIsCropping: (cropping: boolean) => void;
  originalImage: string | null;
  setCroppedImageUrl: (url: string | null) => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isCropping,
  setIsCropping,
  originalImage,
  setCroppedImageUrl,
}) => {
  const imageElement = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);

  const applyCrop = useCallback(() => {
    if (originalImage && completedCrop) {
      const image = document.createElement('img');
      image.src = originalImage;
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) return;
        if (!imageElement.current) return;

        const scale = image.width / imageElement.current.width;

        const cropX = completedCrop.x * scale;
        const cropY = completedCrop.y * scale;
        const cropWidth = completedCrop.width * scale;
        const cropHeight = completedCrop.height * scale;

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        ctx.drawImage(
          image,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight
        );

        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setCroppedImageUrl(url);
            setIsCropping(false);
          }
        }, 'image/jpeg', 0.95);
      };
    }
  }, [originalImage, completedCrop, setCroppedImageUrl, setIsCropping]);

  return (
    <Modal opened={isCropping} onClose={() => setIsCropping(false)} title="Crop Image" size="lg">
      {originalImage && (
        <>
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
          >
            <img src={originalImage} alt="Original" ref={imageElement}/>
          </ReactCrop>

          <Group>
            <Button onClick={applyCrop} mt="md">Apply Crop</Button>
            <Button onClick={() => setIsCropping(false)} mt="md" ml="md">Cancel</Button>
          </Group>
        </>
      )}
    </Modal>
  );
};
