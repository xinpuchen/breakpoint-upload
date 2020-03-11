import React, { Component } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

import defaultRequest from './utils/request';
import attrAccept from './utils/attr-accept';
import traverseFileTree from './utils/traverseFileTree';
import warning from './utils/warning';

const noop = () => {};

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
    onStart: noop,
    onError: noop,
    onSuccess: noop,
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
    this.fileSlices = {};
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
    this.files = {};
    this.fileSlices = {};
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

  sliceFileChunk(file, size) {
    const fileSlices = [];
    let cur = 0;
    while (cur < file.size) {
      const slice = new File([file.slice(cur, cur + size)], file.name, {
        type: file.type,
      });
      fileSlices.push(
        Object.assign(slice, {
          uid: file.uid,
          hash: `${file.type}-${file.size}-${file.lastModified}-${cur}`,
        }),
      );
      cur += size;
    }
    this.fileSlices[file.uid] = fileSlices;
    return fileSlices;
  }

  uploadFiles(files) {
    const postFiles = [...files];
    postFiles.forEach(file => {
      const fileWithId = Object.assign(file, { uid: getUid() });
      this.upload(fileWithId, postFiles);
    });
  }

  upload(file, fileList) {
    const { beforeUpload } = this.props;
    if (!beforeUpload) {
      return setTimeout(() => this.beforeRequest(file), 0);
    }
    const before = beforeUpload(file, fileList);
    if (before && before.then) {
      before
        .then(processedFile => {
          const processedFileType = Object.prototype.toString.call(processedFile);
          if (processedFileType === '[object File]' || processedFileType === '[object Blob]') {
            return this.beforeRequest(processedFile);
          }
          return this.beforeRequest(file);
        })
        .catch(e => {
          warning(false, e);
        });
    } else if (before !== false) {
      setTimeout(() => this.beforeRequest(file), 0);
    }
    return true;
  }

  beforeRequest(file) {
    if (!this.uploaderMounted) return;
    const { data, action, breakPoint, sliceSize, onStart } = this.props;

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
      if (breakPoint) {
        this.reqs[uid] = {};
        this.uploadedSlice[uid] = {};
        this.progressEvent[uid] = {};
        this.sliceFileChunk(file, sliceSize).forEach(slice => {
          this.reqs[uid][slice.hash] = this.request({ ...params, file: slice });
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
      breakPoint,
      onProgress,
      onSuccess,
      onError,
    } = this.props;
    const request = customRequest || defaultRequest;
    const { file } = params;
    const { uid, hash } = file;
    request({
      ...params,
      filename: name,
      headers,
      withCredentials,
      onProgress: e => {
        if (breakPoint) {
          this.progressEvent[uid][hash] = e;
          const loaded = values(this.progressEvent[uid])
            .map(l => l.loaded)
            .reduce((a, b) => a + b, 0);
          const total = this.files[uid].size;
          const percent = loaded / total > 1 ? 100 : (loaded / total) * 100;
          e.totalPercent = percent;
          onProgress(e, this.files[uid]);
        } else {
          onProgress(e, file);
        }
      },
      onSuccess: (res, xhr) => {
        if (breakPoint) {
          delete this.reqs[uid][hash];
          this.uploadedSlice[uid][hash] = file;
          if (keys(this.uploadedSlice[uid]).length === this.fileSlices[uid].length) {
            onSuccess(res, this.files[uid], xhr);
            delete this.files[uid];
            delete this.uploadedSlice[uid];
            delete this.progressEvent[uid];
          }
        } else {
          delete this.reqs[uid];
          delete this.files[uid];
          onSuccess(res, file, xhr);
        }
      },
      onError: (err, res) => {
        if (breakPoint) {
          delete this.reqs[uid][hash];
          onError(err, res, this.files[uid]);
        } else {
          delete this.reqs[uid];
          onError(err, res, file);
        }
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
