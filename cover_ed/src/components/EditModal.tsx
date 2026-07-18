import React, { useState } from 'react';
import { Modal, TextInput, NumberInput, Button, Box, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Dropzone } from '@mantine/dropzone';
import { invoke } from '@tauri-apps/api/core';
import { Mp3File } from '../types';
import { ImageCropModal } from './ImageCropModal';
import { imageToRenderBlob, imageToRenderUrl, RENDER_SIZE, RENDER_SIZE_CSS } from '../utils';

interface EditModalProps {
  editingFile: boolean;
  currentFile: Mp3File | null;
  endFileEditing: (editing: boolean) => void;
  bulkEditing: boolean;
  setBulkEditing: (editing: boolean) => void;
  selectedFiles: string[];
  originalImage: string | null;
  setOriginalImage: (image: string | null) => void;
  loadFiles: (path: string) => Promise<void>;
  currentDir: string;
}

export const EditModal: React.FC<EditModalProps> = ({
  editingFile,
  currentFile,
  endFileEditing,
  bulkEditing,
  setBulkEditing,
  selectedFiles,
  originalImage,
  setOriginalImage,
  loadFiles,
  currentDir,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [renderImageUrl, setRenderImageUrl] = useState<string | undefined>(undefined);
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      title: currentFile?.title || '',
      artist: currentFile?.artist || '',
      album: currentFile?.album || '',
      year: currentFile?.year || undefined,
    },
  });

  const handleDrop = async (files: File[]) => {
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setOriginalImage(e.target.result as string);
        setCroppedImageUrl(null);

        imageToRenderUrl(e.target.result as string, setRenderImageUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEdit = async (values: typeof form.values) => {
    setLoading(true);
    setError(null);
    try {
      let mustRefresh = false;
      let url = croppedImageUrl ? croppedImageUrl : originalImage;

      if (bulkEditing) {
        selectedFiles.forEach(async (filePath, i) => {
          const updateData: any = {};
          if (values.artist.length > 0) updateData.artist = values.artist;
          if (values.album.length > 0) updateData.album = values.album;
          if (values.year !== undefined) updateData.year = values.year;

          await invoke('update_metadata', {
            filePath,
            ...updateData,
          });

          await updateCoverArt(url!, filePath, i + 1 === selectedFiles.length);

          mustRefresh = true;
        });
      } else if (currentFile) {
        await invoke('update_metadata', {
          filePath: currentFile.path,
          ...values,
        });

        await updateCoverArt(url!, currentFile.path, true);

        mustRefresh = true;
      }

      if (mustRefresh) await loadFiles(currentDir);

      closeModal();
    } catch (err) {
      setError('Failed to update metadata.');
      console.error(err);
    } finally {
      setLoading(false);
    }

    async function updateCoverArt(imageUrl: string, path: String, reload: boolean) {
      const callBackend = async (blob: Blob) => {
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        await invoke('update_cover_art', {
          filePath: path,
          imageData: Array.from(uint8Array),
        });

        if (!reload) return;

        await loadFiles(currentDir);
      }

      await imageToRenderBlob(imageUrl, callBackend, 500);
    }
  };

  const closeModal = () => {
    endFileEditing(false);
    setBulkEditing(false);
    setOriginalImage(null);
    setRenderImageUrl(undefined);
    setCroppedImageUrl(null);
    form.reset();
  };

  return (
    <>
      <Modal opened={editingFile || bulkEditing} onClose={closeModal} title={bulkEditing ? "Bulk Edit Metadata" : "Edit Metadata"}>
        <form onSubmit={form.onSubmit(handleSaveEdit)}>
          {!bulkEditing && <TextInput label="Title" {...form.getInputProps('title')} />}
          <TextInput label="Artist" {...form.getInputProps('artist')} />
          <TextInput label="Album" {...form.getInputProps('album')} />
          <NumberInput label="Year" {...form.getInputProps('year')} />

          <Dropzone
            onDrop={handleDrop}
            accept={['image/png', 'image/jpeg']}
            maxSize={3 * 1024 ** 2}
            mt="md"
            h={(originalImage || croppedImageUrl) ? undefined : RENDER_SIZE}
          >
            <Text>Drag cover image here or click to select</Text>
          </Dropzone>

          {(originalImage || croppedImageUrl) && (
            <Box mt="md" style={{ maxWidth: RENDER_SIZE_CSS, maxHeight: RENDER_SIZE_CSS, margin: 'auto', overflow: "hidden" }}>
              <img
                src={renderImageUrl}
                alt="Cover preview"
                style={{ border: '1px solid #ccc' }}
                onClick={() => setIsCropping(true)}
              />
              <Text size="sm" mt="xs">Click image to crop</Text>
            </Box>
          )}

          {error && <Text color="red" mt="md">{error}</Text>}
          <Button type="submit" mt="md" loading={loading}>Save Changes</Button>
        </form>
      </Modal>

      <ImageCropModal
        isCropping={isCropping}
        setIsCropping={setIsCropping}
        originalImage={originalImage}
        setCroppedImageUrl={url => {
          setCroppedImageUrl(url);

          imageToRenderUrl(url as string, setRenderImageUrl);
        }}
      />
    </>
  );
};
