const dbName = "playlist-db";

/**
 *  Usage example
 *
 *    const database = new Database(dbName);
 *
 *    setTimeout(async () => {
 *      const id = "/music/files/Friday Fears/Hand in the Air.mp3";
 *
 *      const record = await database.get(id);
 *
 *      console.info("found", record);
 *    }, 100);
 *
 *    setTimeout(async () => {
 *      const data = {
 *        id: "/music/files/Friday Fears/Test Data Update",
 *        lastModified: "Wed, 04 Nov 2020 10:40:51 GMT",
 *        isNew: false,
 *      };
 *
 *      const record = await database.update(data);
 *
 *      console.info("updated", record);
 *    }, 100);
 */

class Database {
  constructor(name) {
    this.dbName = name;
  }

  tx = (write = false) => {
    try {
      return write
        ? this.db.transaction("Metadata", "readwrite").objectStore("Metadata")
        : this.db.transaction("Metadata").objectStore("Metadata");
    } catch (_error) {
      this.db.close();

      const request = indexedDB.deleteDatabase(dbName);

      request.onsuccess = function () {
        console.info("Deleted database successfully");
      };
      request.onerror = function () {
        console.info("Couldn't delete database");
      };
      request.onblocked = function () {
        console.info(
          "Couldn't delete database due to the operation being blocked"
        );
      };
    }
  };

  get = async (key) =>
    new Promise((resolve, reject) => {
      const metadata = this.tx();

      const request = metadata.get(key);

      request.onsuccess = (e) => resolve(e.target.result);

      request.onerror = (event) => {
        reject(event);
      };
    });

  update = async (updateData) =>
    new Promise((resolve, reject) => {
      const metadata = this.tx(true);

      const request = metadata.get(updateData.id);

      request.onerror = (event) => {
        reject(event);
      };

      request.onsuccess = (event) => {
        const current = event.target.result;

        const requestUpdate = metadata.put({ ...current, ...updateData });

        requestUpdate.onerror = (event) => {
          reject(event);
        };

        requestUpdate.onsuccess = (e) => resolve(e.target.result);
      };
    });

  open = () => {
    const openRequest = indexedDB.open(this.dbName, 1);

    openRequest.onupgradeneeded = (event) => {
      const db = openRequest.result;

      if (event.oldVersion === 0) {
        db.createObjectStore("Metadata", { keyPath: "id" });
      }
    };

    openRequest.onerror = () => {
      if (this.failure) this.failure(openRequest.error);
    };

    openRequest.onsuccess = () => {
      this.db = openRequest.result;

      this.db.onversionchange = () => {
        this.db.close();
        window.location.reload();
      };

      openRequest.onblocked = () => {
        if (this.failure) this.failure(`IndexDB '${this.dbName}' blocked`);
      };

      if (this.ready) this.ready(this.db);
    };
  };

  onReady = (callback) => (this.ready = callback);
  onFailure = (callback) => (this.failure = callback);

  async addMetadata(meta) {
    await this.update(meta);
  }

  async getMetadata(filename) {
    return await this.get(filename);
  }

  async updateMetadata(updateData) {
    await this.update(updateData);
  }
}

class AudioDataStore {
  constructor() {
    this.store = new DummyDataStore();

    let db = new Database(dbName);

    db.onReady(() => (this.store = db));
    db.onFailure((cause) => {
      db = null;
      console.error("Cannot use local store", cause);
    });

    db.open();
  }

  async addMetadata(meta) {
    return this.store.addMetadata(meta);
  }

  async getMetadata(filename) {
    return await this.store.getMetadata(filename);
  }

  async updateMetadata(updateData) {
    return this.store.updateMetadata(updateData);
  }
}

class DummyDataStore {
  constructor() {
    this.name = "Dummy Store";
  }

  async addMetadata(meta) {}

  async getMetadata(filename) {
    return [];
  }

  async updateMetadata(updateData) {}
}

export const audioDataStore = new AudioDataStore();
