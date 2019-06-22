const packageJson = require('../package.json'),
    os = require('os'),
    uuid = require('uuid')

const random = (os.hostname() + '1234567890abcdef').split('').slice(0, 16).map(c => c.charCodeAt(0)) 

const devOpts = {
    autoAdvertise: true,
    uuid: uuid.v4({ random }),
    productName: packageJson.name,
    productVersion: packageJson.version,

    domain: 'schemas-upnp-org',
    type: 'MediaServer',
    version: '1',

    friendlyName: `FooNoo [${os.hostname()}]`,
    manufacturer: 'Oxyflour Fang',
    manufacturerURL: 'https://github.com/oxyflour',
    modelName: 'foobar2000 Media Server [foo_noo]',
    modelDescription: 'Some foobar2000 Media Server [foo_noo]',
    modelNumber: packageJson.version,
    modelURL: 'https://github.com/oxyflour/foo_noo',
    serialNumber: '6666-6666-6666-6666',
    UPC: '123456789012'
}

const contentDirectoryDescription = {
    actions: {
        Browse: {
            inputs: {
                ObjectID: 'A_ARG_TYPE_ObjectID',
                BrowseFlag: 'A_ARG_TYPE_BrowseFlag',
                Filter: 'A_ARG_TYPE_Filter',
                StartingIndex: 'A_ARG_TYPE_Index',
                RequestedCount: 'A_ARG_TYPE_Count',
                SortCriteria: 'A_ARG_TYPE_SortCriteria',
            },
            outputs: {
                Result: 'A_ARG_TYPE_Result',
                NumberReturned: 'A_ARG_TYPE_Count',
                TotalMatches: 'A_ARG_TYPE_Count',
                UpdateID: 'A_ARG_TYPE_UpdateID',
            },
        },
        GetSortCapabilities: {
            outputs: {
                SortCaps: 'SortCapabilities',
            },
        },
        GetSystemUpdateID: {
            outputs: {
                Id: 'SystemUpdateID',
            },
        },
        GetSearchCapabilities: {
            outputs: {
                SearchCaps: 'SearchCapabilities',
            },
        },
        Search: {
            inputs: {
                ContainerID: 'A_ARG_TYPE_ObjectID',
                SearchCriteria: 'A_ARG_TYPE_SearchCriteria',
                Filter: 'A_ARG_TYPE_Filter',
                StartingIndex: 'A_ARG_TYPE_Index',
                RequestedCount: 'A_ARG_TYPE_Count',
                SortCriteria: 'A_ARG_TYPE_SortCriteria',
            },
            outputs: {
                Result: 'A_ARG_TYPE_Result',
                NumberReturned: 'A_ARG_TYPE_Count',
                TotalMatches: 'A_ARG_TYPE_Count',
                UpdateID: 'A_ARG_TYPE_UpdateID',
            },
        },
    },
    variables: {
        A_ARG_TYPE_BrowseFlag: {
            type: 'string',
            enum: [
                'BrowseMetadata',
                'BrowseDirectChildren',
            ],
        },
        ContainerUpdateIDs: {
            event: true,
            type: 'string',
        },
        SystemUpdateID: {
            event: true,
            type: 'ui4',
        },
        A_ARG_TYPE_Count: 'ui4',
        A_ARG_TYPE_SortCriteria: 'string',
        A_ARG_TYPE_SearchCriteria: 'string',
        SortCapabilities: 'string',
        A_ARG_TYPE_Index: 'ui4',
        A_ARG_TYPE_ObjectID: 'string',
        A_ARG_TYPE_UpdateID: 'string',
        A_ARG_TYPE_Result: 'string',
        SearchCapabilities: 'string',
        A_ARG_TYPE_Filter: 'string',
    },
}

const avTransportDescription = {
    actions: {
        GetCurrentTransportActions: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
            outputs: {
                Actions: 'CurrentTransportActions'
            },
        },
        GetDeviceCapabilities: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
            outputs: {
                PlayMedia: 'PossiblePlaybackStorageMedia',
                RecMedia: 'PossibleRecordStorageMedia',
                RecQualityModes: 'PossibleRecordQualityModes',
            },
        },
        GetMediaInfo: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
            outputs: {
                NrTracks: 'NumberOfTracks',
                MediaDuration: 'CurrentMediaDuration',
                CurrentURI: 'AVTransportURI',
                CurrentURIMetaData: 'AVTransportURIMetaData',
                NextURI: 'NextAVTransportURI',
                NextURIMetaData: 'NextAVTransportURIMetaData',
                PlayMedium: 'PlaybackStorageMedium',
                RecordMedium: 'RecordStorageMedium',
                WriteStatus: 'RecordMediumWriteStatus',
            },
        },
        GetPositionInfo: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
            outputs: {
                Track: 'CurrentTrack',
                TrackDuration: 'CurrentTrackDuration',
                TrackMetaData: 'CurrentTrackMetaData',
                TrackURI: 'CurrentTrackURI',
                RelTime: 'RelativeTimePosition',
                AbsTime: 'AbsoluteTimePosition',
                RelCount: 'RelativeCounterPosition',
                AbsCount: 'AbsoluteCounterPosition',
            },
        },
        GetTransportInfo: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
            outputs: {
                CurrentTransportState: 'TransportState',
                CurrentTransportStatus: 'TransportStatus',
                CurrentSpeed: 'TransportPlaySpeed',
            },
        },
        GetTransportSettings: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
            outputs: {
                PlayMode: 'CurrentPlayMode',
                RecQualityMode: 'CurrentRecordQualityMode',
            },
        },
        Next: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
        },
        Pause: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
        },
        Play: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
                Speed: 'TransportPlaySpeed',
            },
        },
        Previous: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
        },
        Seek: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
                Unit: 'A_ARG_TYPE_SeekMode',
                Target: 'A_ARG_TYPE_SeekTarget',
            },
        },
        SetAVTransportURI: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
                CurrentURI: 'AVTransportURI',
                CurrentURIMetaData: 'AVTransportURIMetaData',
            },
        },
        SetNextAVTransportURI: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
                NextURI: 'NextAVTransportURI',
                NextURIMetaData: 'NextAVTransportURIMetaData',
            },
        },
        SetPlayMode: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
                NewPlayMode: 'CurrentPlayMode',
            },
        },
        Stop: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
            },
        },
    },
    variables: {
        CurrentPlayMode: {
            type: 'string',
            default: 'NORMAL',
            enum: [
                'NORMAL',
                'REPEAT_ALL',
                'INTRO',
            ],
        },
        RecordStorageMedium: {
            type: 'string',
            enum: [
                'UNKNOWN',
                'DV',
                'MINI-DV',
                'VHS',
                'W-VHS',
                'S-VHS',
                'D-VHS',
                'VHSC',
                'VIDEO8',
                'HI8',
                'CD-ROM',
                'CD-DA',
                'CD-R',
                'CD-RW',
                'VIDEO-CD',
                'SACD',
                'MD-AUDIO',
                'MD-PICTURE',
                'DVD-ROM',
                'DVD-VIDEO',
                'DVD-R',
                'DVD+RW',
                'DVD-RW',
                'DVD-RAM',
                'DVD-AUDIO',
                'DAT',
                'LD',
                'HDD',
                'MICRO-MV',
                'NETWORK',
                'NONE',
                'NOT_IMPLEMENTED',
                'vendor-defined',
            ],
        },
        LastChange: {
            event: true,
            type: 'string',
        },
        RelativeTimePosition: {
            type: 'string',
        },
        CurrentTrackURI: {
            type: 'string',
        },
        CurrentTrackDuration: {
            type: 'string',
        },
        CurrentRecordQualityMode: {
            type: 'string',
            enum: [
                '0:EP',
                '1:LP',
                '2:SP',
                '0:BASIC',
                '1:MEDIUM',
                '2:HIGH',
                'NOT_IMPLEMENTED',
                'vendor-defined',
            ],
        },
        CurrentMediaDuration: {
            type: 'string',
        },
        AbsoluteCounterPosition: {
            type: 'i4',
        },
        RelativeCounterPosition: {
            type: 'i4',
        },
        A_ARG_TYPE_InstanceID: {
            type: 'ui4',
        },
        AVTransportURI: {
            type: 'string',
        },
        TransportState: {
            type: 'string',
            enum: [
                'STOPPED',
                'PAUSED_PLAYBACK',
                'PAUSED_RECORDING',
                'PLAYING',
                'RECORDING',
                'TRANSITIONING',
                'NO_MEDIA_PRESENT',
            ],
        },
        CurrentTrackMetaData: {
            type: 'string',
        },
        NextAVTransportURI: {
            type: 'string',
        },
        PossibleRecordQualityModes: {
            type: 'string',
        },
        CurrentTrack: {
            type: 'ui4',
            range: {
                min: 0,
                max: 0,
                step: 1,
            },
        },
        AbsoluteTimePosition: {
            type: 'string',
        },
        NextAVTransportURIMetaData: {
            type: 'string',
        },
        PlaybackStorageMedium: {
            type: 'string',
            enum: [
                'UNKNOWN',
                'DV',
                'MINI-DV',
                'VHS',
                'W-VHS',
                'S-VHS',
                'D-VHS',
                'VHSC',
                'VIDEO8',
                'HI8',
                'CD-ROM',
                'CD-DA',
                'CD-R',
                'CD-RW',
                'VIDEO-CD',
                'SACD',
                'MD-AUDIO',
                'MD-PICTURE',
                'DVD-ROM',
                'DVD-VIDEO',
                'DVD-R',
                'DVD+RW',
                'DVD-RW',
                'DVD-RAM',
                'DVD-AUDIO',
                'DAT',
                'LD',
                'HDD',
                'MICRO-MV',
                'NETWORK',
                'NONE',
                'NOT_IMPLEMENTED',
                'vendor-defined',
            ],
        },
        CurrentTransportActions: {
            type: 'string',
        },
        RecordMediumWriteStatus: {
            type: 'string',
            enum: [
                'WRITABLE',
                'PROTECTED',
                'NOT_WRITABLE',
                'UNKNOWN',
                'NOT_IMPLEMENTED',
            ],
        },
        PossiblePlaybackStorageMedia: {
            type: 'string',
        },
        AVTransportURIMetaData: {
            type: 'string',
        },
        NumberOfTracks: {
            type: 'ui4',
            range: {
                min: 0,
                max: 0,
                step: 1,
            },
        },
        A_ARG_TYPE_SeekMode: {
            type: 'string',
            enum: [
                'ABS_TIME',
                'REL_TIME',
                'ABS_COUNT',
                'REL_COUNT',
                'TRACK_NR',
                'CHANNEL_FREQ',
                'TAPE-INDEX',
                'FRAME',
            ],
        },
        A_ARG_TYPE_SeekTarget: {
            type: 'string',
        },
        PossibleRecordStorageMedia: {
            type: 'string',
        },
        TransportStatus: {
            type: 'string',
            enum: [
                'OK',
                'ERROR_OCCURRED',
                'vendor-defined',
            ],
        },
        TransportPlaySpeed: {
            type: 'string',
            enum: [
                '1',
                'vendor-defined',
            ],
        },
    },
}

const renderingControlDescription = {
    actions: {
        GetVolume: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
                Channel: 'A_ARG_TYPE_Channel',
            },
            outputs: {
                CurrentVolume: 'Volume',
            },
        },
        SetVolume: {
            inputs: {
                InstanceID: 'A_ARG_TYPE_InstanceID',
                Channel: 'A_ARG_TYPE_Channel',
                DesiredVolume: 'Volume',
            },
            outputs: {
            },
        },
    },
    variables: {
        A_ARG_TYPE_InstanceID: {
            type: 'ui4',
        },
        A_ARG_TYPE_Channel: {
            type: 'string',
            enum: [
                'Master',
            ],
        },
        Volume: {
            type: 'ui2',
            range: {
                min: 0,
                max: 100,
                step: 1,
            },
        },
    },
}

const connectionManagerDescription = {
    actions: {
        GetProtocolInfo: {
            inputs: {
            },
            outputs: {
                Source: 'SourceProtocolInfo',
                Sink: 'SinkProtocolInfo',
            },
        },
        GetCurrentConnectionIDs: {
            inputs: {
            },
            outputs: {
                ConnectionIDs: 'CurrentConnectionIDs',
            },
        },
        GetCurrentConnectionInfo: {
            inputs: {
                ConnectionID: 'A_ARG_TYPE_ConnectionID',
            },
            outputs: {
                RcsID: 'A_ARG_TYPE_RcsID',
                AVTransportID: 'A_ARG_TYPE_AVTransportID',
                ProtocolInfo: 'A_ARG_TYPE_ProtocolInfo',
                PeerConnectionManager: 'A_ARG_TYPE_ConnectionManager',
                PeerConnectionID: 'A_ARG_TYPE_ConnectionID',
                Direction: 'A_ARG_TYPE_Direction',
                Status: 'A_ARG_TYPE_ConnectionStatus',
            },
        },
    },
    variables: {
        SourceProtocolInfo: {
            event: true,
            type: 'string',
        },
        SinkProtocolInfo: {
            event: true,
            type: 'string',
        },
        CurrentConnectionIDs: {
            event: true,
            type: 'string',
        },
        A_ARG_TYPE_ConnectionStatus: {
            type: 'string',
            enum: [
                'OK',
                'ContentFormatMismatch',
                'InsufficientBandwidth',
                'UnreliableChannel',
                'Unknown',
            ],
        },
        A_ARG_TYPE_ConnectionManager: 'string',
        A_ARG_TYPE_Direction: {
            type: 'string',
            enum: [
                'Input',
                'Output',
            ],
        },
        A_ARG_TYPE_ProtocolInfo: 'string',
        A_ARG_TYPE_ConnectionID: 'i4',
        A_ARG_TYPE_AVTransportID: 'i4',
        A_ARG_TYPE_RcsID: 'i4',
    },
}

module.exports = { devOpts, contentDirectoryDescription, avTransportDescription, renderingControlDescription, connectionManagerDescription }
