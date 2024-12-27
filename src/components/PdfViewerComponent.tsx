import { useEffect, useRef, useState } from 'react';
import PSPDFKit, { AnnotationJSONUnion, CommentJSON, FormFieldJSON, Instance } from 'pspdfkit';
import { cloneArrayBuffer, FormFieldValueJson, getBinaryData, getImage, getPdf, isYDocEmpty, uploadBinaryData, uploadPdf, useCollaboration } from './useCollaboration';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

const SIGNALING_SERVER = ['ws://localhost:4444'];

export default function PdfViewerComponent() {
  const containerRef = useRef(null);
  const [instance, setInstance] = useState<Instance | null>(null);

  // Change the roomname to have a new test
  const roomName = 'EXAMPLE_ROOM_NAME_60';
  const yObject = useCollaboration(instance, roomName, SIGNALING_SERVER, 'password-secret');

  useEffect(() => {
    const container = containerRef.current;

    (async function () {
      if (yObject && (!yObject.isIndexeddbReady || !yObject.isWebRtcReady)) return;
      if (container == null) return;
      PSPDFKit.unload(container); // Ensure that there's only one PSPDFKit instance.

      const document = await getPdf();
      if (document == null) return;

      // Initialize the first instance to extract the annotations and prepare a cleaned PDF
      const firstInstance = await PSPDFKit.load({
        document: document,
        licenseKey: 'iiGukGcoU9QuaXYzgGh1IGMhbkdufds9_PKjVv3Jv4_Wt0lFA0_SRW7KrwwdOK1xEncOS7lGRq9-5J9y-TRnt7Isxa209hcV_DmJcwY3wRyWnDYM3Q2sdRAMbOt6X-hZdW3igkLF7LFN4T_AaP8N16eqyz36VHTWzdNUfG5NgQpe0C5319lBeLBTyRY1UsNy3KpiJNZl46eXsuZhLD_VsGBjznNBTqENkqqiOHTfmi_kEjtSn0TkLyuhdsDYopDlkmoUJReffCO7zPPcXf_t9A6qR6z_r5hQB-mOu_8L5FZKUSF5Pqoosu6lr3lXUCYH_GbkCbtP_LzLij8eHP-fh8zA90I34-QkLFmIeK80h0sGBO3m9DSMQQ-zvUYc1n29AIakgvKG2xTjRhGUEVypGeLmdomCGTGNZIVoHRa9ETTvtBi0W-xIbtl6XWef3iRJFvymySZqehjUPERVgYPlO4KSNwZiClAud6NilvnYSGqigMBhpppaYzIVJ-tIQ1-kxElATH9qJ6Tj84XfgMi2ipJCzkfJ9T4coNufOUhmsDEH_rxyeuBxVDS-85ESqLcIeAv-_Dv0_4siVBCFB16Q1i3Yxh_FFPmezyH8afkDQ_X_8ipjG4WetYJQ_Q6auy2rI5Hs0tGszj_GU1RImhI4YhEsjwF52KFlKoqYbNpiBrH-X5yvkK7PzZIgofVVIZsLbD7qPmueMGM9XXdPemOupg==',
        headless: true,
        container,
        baseUrl: `${window.location.protocol}//${window.location.host}/`,
      });

      const pagesAnnotations = await Promise.all(
        Array.from({
          length: firstInstance.totalPageCount
        }).map((_, pageIndex) => firstInstance.getAnnotations(pageIndex))
      );

      const allAnnotations = pagesAnnotations.flatMap((pageAnnotations) => pageAnnotations.toArray());
      const allFormFields = await firstInstance.getFormFields();
      const allBookmarks = await firstInstance.getBookmarks();
      const allComments = await firstInstance.getComments();

      if (yObject) {
        const update = await getBinaryData();

        // If the history is found in server, we apply it
        // Otherwise, we build the history from the annotations extracted from the PDF
        if (update) {
          applyUpdate(yObject.yDoc, update);
        } else if (isYDocEmpty(yObject)) {
          yObject.yDoc.transact(async () => {
            for (const annotation of allAnnotations) {
              const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation) as AnnotationJSONUnion;

              if (jsonAnnotation.type === 'pspdfkit/image') continue;
      
              yObject.yArrayAnnotations.push([jsonAnnotation]);
            }

            const jsonFormFields: FormFieldJSON[] = [];
            for (const formField of allFormFields) {
              const jsonFormField = PSPDFKit.FormFields.toSerializableObject(formField);

              jsonFormField.annotationIds = jsonFormField.annotationIds.map((annotationId) => {
                const a = allAnnotations.find((annotation) => annotation.pdfObjectId?.toString() === annotationId);
                return a?.id ?? annotationId;
              });

              jsonFormFields.push(jsonFormField);
            }

            yObject.yArrayFormFields.push(jsonFormFields);

            const jsonFormFieldValues: FormFieldValueJson[] = [];
            for (const formField of allFormFields) {
              const jsonFormFieldValue = firstInstance.getFormFieldValues()[formField.name];
              jsonFormFieldValues.push({
                name: formField.name,
                type: 'pspdfkit/form-field-value',
                v: 1,
                value: jsonFormFieldValue,
              });
            }

            yObject.yArrayFormFieldValues.push(jsonFormFieldValues);

            const jsonBookmarks = [];
            for (const bookmark of allBookmarks) {
              const jsonBookmark = PSPDFKit.Bookmark.toSerializableObject(bookmark);
              jsonBookmarks.push(jsonBookmark);
            }
    
            yObject.yArrayBookmarks.push(jsonBookmarks);

            for (const comment of allComments) {
              const jsonComment = PSPDFKit.Comment.toSerializableObject(comment) as CommentJSON;
              yObject.yArrayComments.push([jsonComment]);
            }
          });
        }
      }

      // Delete all annotations
      await firstInstance.delete(allAnnotations.map((annotation) => annotation.id));

      // Export the cleaned PDF without annotations
      const newPdf = await firstInstance.exportPDF();

      PSPDFKit.unload(firstInstance);

      // The second instance will allow users to edit the PDF
      // Firstly, the PDF is cleaned without any annotations
      const instance = await PSPDFKit.load({
        container,
        enableHistory: true,
        licenseKey: 'iiGukGcoU9QuaXYzgGh1IGMhbkdufds9_PKjVv3Jv4_Wt0lFA0_SRW7KrwwdOK1xEncOS7lGRq9-5J9y-TRnt7Isxa209hcV_DmJcwY3wRyWnDYM3Q2sdRAMbOt6X-hZdW3igkLF7LFN4T_AaP8N16eqyz36VHTWzdNUfG5NgQpe0C5319lBeLBTyRY1UsNy3KpiJNZl46eXsuZhLD_VsGBjznNBTqENkqqiOHTfmi_kEjtSn0TkLyuhdsDYopDlkmoUJReffCO7zPPcXf_t9A6qR6z_r5hQB-mOu_8L5FZKUSF5Pqoosu6lr3lXUCYH_GbkCbtP_LzLij8eHP-fh8zA90I34-QkLFmIeK80h0sGBO3m9DSMQQ-zvUYc1n29AIakgvKG2xTjRhGUEVypGeLmdomCGTGNZIVoHRa9ETTvtBi0W-xIbtl6XWef3iRJFvymySZqehjUPERVgYPlO4KSNwZiClAud6NilvnYSGqigMBhpppaYzIVJ-tIQ1-kxElATH9qJ6Tj84XfgMi2ipJCzkfJ9T4coNufOUhmsDEH_rxyeuBxVDS-85ESqLcIeAv-_Dv0_4siVBCFB16Q1i3Yxh_FFPmezyH8afkDQ_X_8ipjG4WetYJQ_Q6auy2rI5Hs0tGszj_GU1RImhI4YhEsjwF52KFlKoqYbNpiBrH-X5yvkK7PzZIgofVVIZsLbD7qPmueMGM9XXdPemOupg==',
        enableClipboardActions: true,
        autoSaveMode: PSPDFKit.AutoSaveMode.DISABLED,
        document: cloneArrayBuffer(newPdf),
        baseUrl: `${window.location.protocol}//${window.location.host}/`,
      });

      if (yObject) {
        const arrayAnnotations = await Promise.all(yObject.yArrayAnnotations.toArray().map(async (annotation) => {
          if (annotation.type !== 'pspdfkit/image') return annotation;

          // Try to create attachment from the custom data
          // TODO: It is not good place to create attachment, try to create attachments when we create the image annotations
          const customAttachmentId = annotation.customData?.customAttachmentId as string;
          const blob = await getImage(customAttachmentId);
          
          if (!customAttachmentId) return annotation;
          
          if (blob) {
            const attachmentId = await instance.createAttachment(blob);

            return {
              ...annotation,
              imageAttachmentId: attachmentId,
            };
          } else {
            return undefined;
          }
        }));

        // Then, we apply the annotations to the PDF
        // We get the annotations from the Yjs document
        const instantJson = {
          annotations: arrayAnnotations.filter(annotation => !!annotation && annotation.type !== 'pspdfkit/image'),
          comments: yObject.yArrayComments.toArray(),
          bookmarks: yObject.yArrayBookmarks.toArray(),
          formFields: yObject.yArrayFormFields.toArray(),
          formFieldValues: yObject.yArrayFormFieldValues.toArray(),
          format: 'https://pspdfkit.com/instant-json/v1',
        }

        await instance.applyOperations([
          {
            type: 'applyInstantJson',
            instantJson,
          },
        ])

        // For the image annotation, we cannot use applyOperations because we dont know how to hash the image the way PSPDFKit does
        // Therefore, we need to create the image annotations manually with instance.create
        // TODO: Handle image annotations with attachments
      }

      instance.setAnnotationCreatorName(Math.random().toString(36).substring(2, 15));
      instance.setToolbarItems((toolbarItems) => {
        return [
          ...toolbarItems,
          {
            type: 'form-creator',
          },
          {
            type: 'undo',
          },
          {
            type: 'redo',
          },
          {
            type: 'custom',
            id: 'upload',
            title: 'Upload',
            onPress: async () => {
              await instance.save();

              const arrayBuffer = await instance.exportPDF();
              const blob = new Blob([arrayBuffer], { type: 'application/pdf' });

              const promises = [];
              promises.push(uploadPdf(new File([blob], 'document.pdf')));

              if (yObject) {
                const binaryDoc = encodeStateAsUpdate(yObject.yDoc);
                promises.push(uploadBinaryData(binaryDoc));
              }

              await Promise.all(promises);
            },
          },
        ];
      });
      setInstance(instance);
    })();

    return () => {
      PSPDFKit.unload(container);
    };
  }, [yObject]);

  return <>
    <div ref={containerRef} className='w-full h-full' />;
  </>
}
