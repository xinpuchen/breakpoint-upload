import React, { Component } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import defaultRequest from './utils/request';
import attrAccept from './utils/attr-accept';
import traverseFileTree from './utils/traverseFileTree';
import warning from './utils/warning';

const now = +new Date();
let index = 0;

function getUid() {
  index += 1;
  return `breakpoint-upload-${now}-${index}`;
}

class BreakpointUpload extends Component {
  static propTypes = {
    name: PropTypes.string,
    disabled: PropTypes.bool,
    action: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    directory: PropTypes.bool,
    onError: PropTypes.func,
    onSuccess: PropTypes.func,
    onProgress: PropTypes.func,
    onStart: PropTypes.func,
    data: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
    headers: PropTypes.object,
    accept: PropTypes.string,
    multiple: PropTypes.bool,
    beforeUpload: PropTypes.func,
    customRequest: PropTypes.func,
    children: PropTypes.node,
    withCredentials: PropTypes.bool,
    style: PropTypes.object,
    className: PropTypes.string,
    breakPoint: PropTypes.bool,
    sliceSize: PropTypes.number,
  };

  static defaultProps = {
    data: {},
    headers: {},
    name: 'file',
    onStart: () => {},
    onError: () => {},
    onSuccess: () => {},
    multiple: false,
    beforeUpload: null,
    customRequest: null,
    withCredentials: false,
    breakPoint: false,
    sliceSize: 10 * 1024 * 1024,
  };

  constructor(props) {
    super(props);
    this.reqs = {};
    this.files = {};
    this.fileSlices = [];
    this.uploadedSlice = {};
    this.progressEvent = {};
    this.state = {
      uid: getUid(),
      isDragging: false,
    };
  }

  componentDidMount() {
    this.uploaderMounted = true;
  }

  componentWillUnmount() {
    this.uploaderMounted = false;
    this.fileSlices = [];
    this.files = {};
    this.uploadedSlice = {};
    this.progressEvent = {};
    this.abort();
  }

  get directory() {
    const { breakPoint, directory } = this.props;
    return breakPoint ? false : directory;
  }

  get multiple() {
    const { breakPoint, multiple } = this.props;
    return breakPoint ? false : multiple;
  }

  onChange = e => {
    const { files } = e.target;
    this.uploadFiles(files);
    this.reset();
  };

  onClick = () => {
    if (!this.fileInput) return;
    this.fileInput.click();
  };

  onKeyDown = e => {
    if (e.key === 'Enter') {
      this.onClick();
    }
  };

  onFileDrop = e => {
    const { accept: propsAccept } = this.props;
    e.preventDefault();

    if (e.type === 'dragover') {
      this.setState({ isDragging: true });
      return;
    }

    if (e.type === 'dragleave') {
      this.setState({ isDragging: false });
      return;
    }

    if (e.type === 'drop') {
      this.setState({ isDragging: false });

      const accept = _file => attrAccept(_file, propsAccept);
      if (this.directory) {
        traverseFileTree([...e.dataTransfer.items], this.uploadFiles, accept);
      } else {
        const files = [...e.dataTransfer.files].filter(accept);
        this.uploadFiles(files);
      }
    }
  };

  computeHash = files =>
    new Promise(resolve => {
      this.worker = new Worker('/utils/hash.js');
      this.worker.postMessage({ files });
      this.worker.onmessage = e => {
        const { hash } = e.data;
        if (hash) {
          resolve(hash);
        }
      };
    });

  sliceFileChunk = (file, size) => {
    const fileSlices = [];
    let cur = 0;
    while (cur < file.size) {
      const slice = new File([file.slice(cur, cur + size)], file.name, {
        type: file.type,
      });
      fileSlices.push(Object.assign(slice, { uid: getUid() }));
      cur += size;
    }
    this.fileSlices = fileSlices;
    return fileSlices;
  };

  uploadFiles = files => {
    const postFiles = [...files];
    postFiles.forEach(file => {
      const fileWithId = Object.assign(file, { uid: getUid() });
      this.upload(fileWithId, postFiles);
    });
  };

  upload(file, fileList) {
    const { beforeUpload } = this.props;
    if (!beforeUpload) {
      return setTimeout(() => this.post(file), 0);
    }
    const before = beforeUpload(file, fileList);
    if (before && before.then) {
      before
        .then(processedFile => {
          const processedFileType = Object.prototype.toString.call(processedFile);
          if (processedFileType === '[object File]' || processedFileType === '[object Blob]') {
            return this.post(processedFile);
          }
          return this.post(file);
        })
        .catch(e => {
          warning(false, e);
        });
    } else if (before !== false) {
      setTimeout(() => this.post(file), 0);
    }
    return true;
  }

  post(file) {
    if (!this.uploaderMounted) return;
    const { data, onStart, action, breakPoint, sliceSize } = this.props;

    let currentData = data;
    if (typeof currentData === 'function') {
      currentData = currentData(file);
    }
    new Promise(resolve => {
      if (typeof action === 'function') {
        return resolve(action(file));
      }
      return resolve(action);
    }).then(currentAction => {
      const { uid } = file;
      const params = {
        file,
        action: currentAction,
        data: currentData,
      };
      this.files[uid] = file;
      onStart(file);
      if (breakPoint && file.size > sliceSize) {
        this.sliceFileChunk(file, sliceSize).forEach(slice => {
          this.reqs[slice.uid] = this.request({ ...params, file: slice });
        });
      } else {
        this.reqs[uid] = this.request(params);
      }
    });
  }

  request(params) {
    const {
      name,
      headers,
      withCredentials,
      customRequest,
      onProgress,
      onSuccess,
      onError,
      breakPoint,
    } = this.props;
    const request = customRequest || defaultRequest;
    const { file } = params;
    const { uid } = file;
    request({
      ...params,
      filename: name,
      headers,
      withCredentials,
      onProgress: e => {
        if (breakPoint) {
          this.progressEvent[uid] = e;
          const percent =
            Object.values(this.progressEvent)
              .map(l => l.loaded)
              .reduce((a, b) => a + b, 0) / Object.values(this.files)[0].size;
          e.percent = percent > 1 ? 100 : percent * 100;
        }
        onProgress(e, Object.values(this.files)[0]);
      },
      onSuccess: (res, xhr) => {
        delete this.reqs[uid];
        if (breakPoint) {
          this.uploadedSlice[uid] = file;
          if (Object.keys(this.uploadedSlice).length === this.fileSlices.length) {
            onSuccess(res, Object.values(this.files)[0], xhr);
            this.files = {};
            this.uploadedSlice = {};
            this.progressEvent = {};
          }
        } else {
          delete this.files[uid];
          onSuccess(res, file, xhr);
        }
      },
      onError: (err, res) => {
        delete this.reqs[uid];
        onError(err, res, file);
      },
    });
  }

  reset() {
    this.setState({
      uid: getUid(),
    });
  }

  resend(fileId) {
    const { accept: propsAccept } = this.props;
    const accept = _file => attrAccept(_file, propsAccept);
    const file = this.files[fileId];
    if (file && accept(file)) {
      this.upload(file, [file]);
    }
  }

  abort(fileId) {
    const { reqs } = this;
    if (fileId) {
      if (reqs[fileId]) {
        reqs[fileId].abort();
        delete reqs[fileId];
      }
    } else {
      Object.keys(reqs).forEach(uid => {
        if (reqs[uid]) {
          reqs[uid].abort();
        }

        delete reqs[uid];
      });
    }
  }

  render() {
    const { className, disabled, style, accept, children } = this.props;
    const { isDragging, uid } = this.state;

    const events = disabled
      ? {}
      : {
          onClick: this.onClick,
          onKeyDown: this.onKeyDown,
          onDrop: this.onFileDrop,
          onDragOver: this.onFileDrop,
          onDragLeave: this.onFileDrop,
        };

    return (
      <span
        {...events}
        className={classNames('upload', {
          'upload-dragover': isDragging,
          'upload-disabled': disabled,
          className,
        })}
        role="button"
        style={style}
      >
        <input
          type="file"
          ref={n => {
            this.fileInput = n;
          }}
          key={uid}
          style={{ display: 'none' }}
          accept={accept}
          directory={this.directory ? 'directory' : null}
          webkitdirectory={this.directory ? 'webkitdirectory' : null}
          multiple={this.multiple}
          onChange={this.onChange}
        />
        {children}
      </span>
    );
  }
}

export default BreakpointUpload;
