import { useEffect, useMemo, useRef } from "react";
import PSPDFKit from "pspdfkit";
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

interface PdfViewerComponentProps {
  document: string;
}

// const ydoc = new Y.Doc();
// const indexeddbProvider = new IndexeddbPersistence('annotations-demo', ydoc);
// indexeddbProvider.whenSynced.then(() => {
//   console.log('loaded data from indexed db');
// });

// const websocketProvider = new WebsocketProvider(
//   'ws://localhost:1234/ws', 'annotations-demo', ydoc
// );

// websocketProvider.on('status', (event) => {
//   console.log(event.status); // logs "connected" or "disconnected"
// });

// const ymap = ydoc.getMap('annotations');

// interface Annotations {
//   annotations: Y.Array<any>;
//   format: string;
// }

export default function PdfViewerComponent({ document }: PdfViewerComponentProps) {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const indexeddbProvider = useMemo(() => new IndexeddbPersistence('annotations', ydoc), [ydoc]);
  const websocketProvider = useMemo(() => new WebsocketProvider('ws://localhost:1234/ws', 'annotations', ydoc), [ydoc]);

  // const yText = useMemo(() => ydoc.getText('annotations'), [ydoc]);
  const yArray = useMemo(() => ydoc.getArray('annotations'), [ydoc]);

  const containerRef = useRef(null);
  const isHandlingYjsChange = useRef(false);
  const isHandlingPSPDFKitChange = useRef(false);

  useEffect(() => {
    const container = containerRef.current;

    (async function () {
      if (!container) return;
      PSPDFKit.unload(container); // Ensure that there's only one PSPDFKit instance.

      const instance = await PSPDFKit.load({
        container,
        document: "/document.pdf",
        baseUrl: `${window.location.protocol}//${window.location.host}/`,
      });

      // await instance.applyOperations([
      //   { type: "applyInstantJson", instantJson: { annotations: yArray.toArray(), format: 'https://pspdfkit.com/instant-json/v1' } },
      // ]);

      window.instance = instance;
      // instance.applyOperations([
      //   { type: "applyInstantJson", instantJson: { annotations: yArray.toArray(), format: 'https://pspdfkit.com/instant-json/v1' } },
      // ]);

      instance.setAnnotationCreatorName(Math.random().toString(36).substring(2, 15));

      yArray.delete(0, yArray.length);

      // Observe changes to annotations in Yjs
      yArray.observe(async (event, transaction) => {
        if (event.target !== yArray || isHandlingPSPDFKitChange.current) return;

        isHandlingYjsChange.current = true;

        console.log('transaction', transaction.origin);

        console.log('yArray changed', event.changes.delta);

        // const deletedItems = event.changes.deleted;
        // deletedItems.forEach((item) => {
        //   const deletedAnnotation = PSPDFKit.Annotations.fromSerializableObject(item.content.getContent()[0]);
        //   instance.delete(item.content.getContent()[0].name);
        // });

        // const addedItems = event.changes.added;
        // addedItems.forEach((item) => {
        //   const newAnnotation = PSPDFKit.Annotations.fromSerializableObject(item.content.getContent()[0]);
        //   instance.create(newAnnotation);
        // });

        const deletedItems = Array.from(event.changes.deleted).map((item) => item.content.getContent()[0]);
        const addedItems = Array.from(event.changes.added).map((item) => item.content.getContent()[0]);

        // add the same id in deletedItems and addedItems to updatedItems
        const updatedItems = deletedItems.filter((deletedItem) => addedItems.some((addedItem) => addedItem.name === deletedItem.name));
        const filteredDeletedItems = deletedItems.filter((deletedItem) => !updatedItems.some((updatedItem) => updatedItem.name === deletedItem.name));
        const filteredAddedItems = addedItems.filter((addedItem) => !updatedItems.some((updatedItem) => updatedItem.name === addedItem.name));

        const ids = (await instance.exportInstantJSON()).annotations?.filter((annotation) => deletedItems.some((deletedItem) => deletedItem.name === annotation.name)).map((annotation) => annotation.id) || [];
        for (const id of  ids) {
          await instance.delete(id);
        }

        for (const item of addedItems) {
          await instance.create(PSPDFKit.Annotations.fromSerializableObject(item));
        }

        isHandlingYjsChange.current = false;

        // updatedItems.map((updateItem) => {
        //   instance.update(PSPDFKit.Annotations.fromSerializableObject(updateItem));
        // });


        // if deletedItem in addedItems, then remove it from deletedItems

      });

      // Handle annotation updates from PSPDFKit
      instance.addEventListener('annotations.update', (annotations) => {
        if (isHandlingYjsChange.current) return;

        isHandlingPSPDFKitChange.current = true;
        try {
          annotations.forEach((annotation) => {
            const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation);
            const index = yArray.toArray().findIndex((a) => a.name === jsonAnnotation.name);
            if (index !== -1) {
              ydoc.transact(() => {
                yArray.delete(index, 1);
                yArray.insert(index, [jsonAnnotation]);
              });
            }
          });
        } finally {
          isHandlingPSPDFKitChange.current = false;
        }
      });

      // Handle annotation creation from PSPDFKit
      instance.addEventListener('annotations.create', (annotations) => {
        if (isHandlingYjsChange.current) return;

        isHandlingPSPDFKitChange.current = true;
        try {
          annotations.forEach((annotation) => {
            const jsonAnnotation = PSPDFKit.Annotations.toSerializableObject(annotation);
            yArray.push([jsonAnnotation]);
          });
        } finally {
          isHandlingPSPDFKitChange.current = false;
        }
      });

      // Handle annotation deletion from PSPDFKit
      instance.addEventListener('annotations.delete', (annotations) => {
        if (isHandlingYjsChange.current) return;

        isHandlingPSPDFKitChange.current = true;
        try {
          annotations.forEach((annotation) => {
            const index = yArray.toArray().findIndex((a) => a.name === annotation.name);
            if (index !== -1) {
              yArray.delete(index, 1);
            }
          });
        } finally {
          isHandlingPSPDFKitChange.current = false;
        }
      });
    })();

    return () => {
      PSPDFKit.unload(container);
    };
  }, [document, yArray, ydoc]);

  return <div ref={containerRef} className="w-full h-full" />;
}