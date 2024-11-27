import { useEffect, useRef, useState } from 'react';
import PSPDFKit, { Instance } from 'pspdfkit';
import { useCollaboration } from './useCollaboration';

export default function PdfViewerComponent() {
  const containerRef = useRef(null);
  const [instance, setInstance] = useState<Instance | null>(null);

  const roomName = 'EXAMPLE_ROOM_NAME';
  const yObject = useCollaboration(instance, roomName);

  useEffect(() => {
    const container = containerRef.current;

    (async function () {
      if (yObject && (!yObject.isIndexeddbReady || !yObject.isWebRtcReady)) return;
      if (container == null) return;
      PSPDFKit.unload(container); // Ensure that there's only one PSPDFKit instance.

      // We need to make sure that the annotations are loaded before PSPDFKit is
      const instance = await PSPDFKit.load({
        container,
        enableHistory: true,
        instantJSON: yObject
          ? {
              annotations: yObject.yArrayAnnotations.toArray(),
              attachments: yObject.yMapAttachments.toJSON(),
              comments: yObject.yArrayComments.toArray(),
              bookmarks: yObject.yArrayBookmarks.toArray(),
              formFields: yObject.yArrayFormFields.toArray(),
              formFieldValues: yObject.yArrayFormFieldValues.toArray(),
              format: 'https://pspdfkit.com/instant-json/v1',
            }
          : undefined,
        document: '/document.pdf',
        baseUrl: `${window.location.protocol}//${window.location.host}/`,
      });

      // window.instance = instance;
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
        ];
      });
      setInstance(instance);
    })();

    return () => {
      PSPDFKit.unload(container);
    };
  }, [yObject]);

  return <div ref={containerRef} className='w-full h-full' />;
}
