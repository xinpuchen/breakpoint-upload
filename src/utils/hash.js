import SparkMD5 from 'spark-md5';

const createFileChunk = (file, size) => {
  const fileChunkList = [];
  let cur = 0;
  while (cur < file.size) {
    fileChunkList.push(file.slice(cur, cur + size));
    cur += size;
  }
  return fileChunkList;
};

const concalculateHash = (file, size) => {
  const fileChunkList = createFileChunk(file, size);
  return new Promise(resolve => {
    const spark = new SparkMD5.ArrayBuffer();
    const reader = new FileReader();
    let count = 0;
    const loadNext = index => {
      reader.readAsArrayBuffer(fileChunkList[index]);
      reader.onload = e => {
        count += 1;
        spark.append(e.target.result);
        if (count === fileChunkList.length) {
          const hash = spark.end();
          fileChunkList.map((chunk, key) => Object.assign(chunk, { uid: hash, hash: `${hash}-${key}` }));
          resolve({ hash, fileChunkList });
        } else {
          loadNext(count);
        }
      };
    };
    loadNext(count);
  });
};

export default concalculateHash;
