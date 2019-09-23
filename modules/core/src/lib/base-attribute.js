/* eslint-disable complexity */
import GL from '@luma.gl/constants';
import {Buffer, hasFeature, FEATURES, _Accessor as Accessor} from '@luma.gl/core';
import {log, uid} from '@luma.gl/core';

export default class BaseAttribute {
  constructor(gl, opts = {}) {
    const {id = uid('attribute'), type, isIndexed = false} = opts;

    // Options that cannot be changed later
    this.gl = gl;
    this.id = id;
    this.isIndexed = isIndexed;
    this.target = isIndexed ? GL.ELEMENT_ARRAY_BUFFER : GL.ARRAY_BUFFER;
    this.type = type;

    if (isIndexed && !type) {
      // If the attribute is indices, auto infer the correct type
      // WebGL2 and WebGL1 w/ uint32 index extension support accepts Uint32Array, otherwise Uint16Array
      this.type =
        gl && hasFeature(gl, FEATURES.ELEMENT_INDEX_UINT32) ? GL.UNSIGNED_INT : GL.UNSIGNED_SHORT;
    }

    // Initialize the attribute descriptor, with WebGL and metadata fields
    this.value = null;
    this.externalBuffer = null;
    this.buffer = null;
    this.userData = {}; // Reserved for application
    this.update(opts);

    // Check all fields and generate helpful error messages
    this._validateAttributeDefinition();
  }

  delete() {
    if (this.buffer) {
      this.buffer.delete();
      this.buffer = null;
    }
  }

  /* eslint-disable max-statements */
  update(opts) {
    const {value, buffer, constant = this.constant || false} = opts;

    this.constant = constant;

    if (buffer) {
      this.externalBuffer = buffer;
      this.constant = false;
      // Hack: Float64Array value is required for double-precision attributes
      // to generate correct shader attributes
      // This is so that we can manually set value to indicate that the external
      // buffer uses interleaved 64-bit values
      this.value = value || null;

      this.type = opts.type || buffer.accessor.type;
      if (buffer.accessor.divisor !== undefined) {
        this.divisor = buffer.accessor.divisor;
      }
      if (opts.divisor !== undefined) {
        this.divisor = opts.divisor;
      }
    } else if (value) {
      this.externalBuffer = null;

      const size = this.size || opts.size || 0;
      if (constant && value.length !== size) {
        this.value = new Float32Array(size);
        // initiate offset values
        this._setAccessor(opts);
        const index = this.elementOffset;
        for (let i = 0; i < this.size; ++i) {
          this.value[i] = value[index + i];
        }
      } else {
        this.value = value;
      }

      // Create buffer if needed
      if (!constant && this.gl) {
        this.buffer = this.buffer || this._createBuffer();
        this.buffer.setData({data: value});
        this.type = this.buffer.accessor.type;
      }
    }

    this._setAccessor(opts);

    if (constant && this.normalized) {
      this.value = this._normalizeConstant(this.value);
    }
  }

  getBuffer() {
    if (this.constant) {
      return null;
    }
    return this.externalBuffer || this.buffer;
  }

  getValue() {
    if (this.constant) {
      return this.value;
    }
    const buffer = this.externalBuffer || this.buffer;
    if (buffer) {
      return [buffer, this];
    }
    return null;
  }

  _createBuffer() {
    // Move accessor fields to accessor object
    const props = {
      id: this.id,
      target: this.target,
      accessor: {
        type: this.type
      }
    };
    if (Number.isFinite(props.divisor)) {
      props.accessor.divisor = props.divisor;
    }
    delete props.divisor;
    if (Number.isFinite(props.size)) {
      props.accessor.size = props.size;
    }
    delete props.size;

    return new Buffer(this.gl, props);
  }

  // Sets all accessor props except type
  // TODO - store on `this.accessor`
  _setAccessor(opts) {
    const {
      // accessor props
      size = this.size,
      offset = this.offset || 0,
      stride = this.stride || 0,
      normalized = this.normalized || false,
      integer = this.integer || false,
      divisor = this.divisor || 0,
      instanced,
      isInstanced
    } = opts;

    this.size = size;
    this.offset = offset;
    this.elementOffset = offset / Accessor.getBytesPerElement(this);
    this.stride = stride;
    this.normalized = normalized;
    this.integer = integer;

    this.divisor = divisor;

    if (isInstanced !== undefined) {
      log.deprecated('Attribute.isInstanced')();
      this.divisor = isInstanced ? 1 : 0;
    }
    if (instanced !== undefined) {
      log.deprecated('Attribute.instanced')();
      this.divisor = instanced ? 1 : 0;
    }
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer
  _normalizeConstant(value) {
    switch (this.type) {
      case GL.BYTE:
        // normalize [-128, 127] to [-1, 1]
        return new Float32Array(value).map(x => ((x + 128) / 255) * 2 - 1);

      case GL.SHORT:
        // normalize [-32768, 32767] to [-1, 1]
        return new Float32Array(value).map(x => ((x + 32768) / 65535) * 2 - 1);

      case GL.UNSIGNED_BYTE:
        // normalize [0, 255] to [0, 1]
        return new Float32Array(value).map(x => x / 255);

      case GL.UNSIGNED_SHORT:
        // normalize [0, 65535] to [0, 1]
        return new Float32Array(value).map(x => x / 65535);

      default:
        // No normalization for gl.FLOAT and gl.HALF_FLOAT
        return value;
    }
  }

  _validateAttributeDefinition() {
    // Can be undefined for buffers (auto deduced from shaders)
    // or larger than 4 for uniform arrays
    // assert(
    //   this.size >= 1 && this.size <= 4,
    //   `Attribute definition for ${this.id} invalid size`
    // );
  }
}
